const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' })); // Image size limit vadhayi hai taaki 5 photos aaram naal jaan
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

const frontendPath = path.join(__dirname, 'ReSell-HTML-Frontend');
app.use(express.static(frontendPath));

// ==========================================
// MONGODB ATLAS CONNECTION & SCHEMAS
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Atlas Connected Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 1. User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    wishlist: { type: Array, default: [] }, // NAVA ADD KITA: Wishlist array
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// 2. Product Schema (NAVA ADD KITA)
const productSchema = new mongoose.Schema({
    title: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, required: true },
    loc: { type: String, required: true },
    phone: { type: String, required: true },
    altPhone: { type: String },
    desc: { type: String, required: true },
    date: { type: String },
    sellerName: { type: String },
    img: { type: String },
    images: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});
const Product = mongoose.model('Product', productSchema);

// ==========================================
// NODEMAILER SETUP
// ==========================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const otpStore = {};

// ==========================================
// API ROUTES
// ==========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'home.html'));
});

// 🟢 Check User Email
app.post('/api/check-user', async (req, res) => {
    const { email } = req.body;
    try {
        const userEmail = await User.findOne({ email });
        if (userEmail) return res.status(400).json({ success: false, message: "Account already exists with this Email. Please login." });
        res.json({ success: true, message: "Available" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 🟢 ROUTE: Toggle Wishlist (Add/Remove)
app.post('/api/toggle-wishlist', async (req, res) => {
    const { email, productId } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // Check if product is already in wishlist
        const index = user.wishlist.indexOf(productId);
        if (index > -1) {
            // Agar pehla ton hai, taan remove krdo (Unlike)
            user.wishlist.splice(index, 1);
            await user.save();
            return res.json({ success: true, action: 'removed' });
        } else {
            // Agar nahi hai, taan add krdo (Like)
            user.wishlist.push(productId);
            await user.save();
            return res.json({ success: true, action: 'added' });
        }
    } catch (error) {
        console.error("Wishlist Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 🟢 ROUTE: Get all products in User's Wishlist
app.post('/api/get-wishlist', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: false, message: "User not found" });

        // Database cho oh saare products chakko jina di ID user di wishlist array vich hai
        const products = await Product.find({ _id: { $in: user.wishlist } });

        res.json({ success: true, products });
    } catch (error) {
        console.error("Fetch Wishlist Error:", error);
        res.status(500).json({ success: false, message: "Server error fetching wishlist" });
    }
});

// 🟢 ROUTE: Check Wishlist Status
app.post('/api/check-wishlist', async (req, res) => {
    const { email, productId } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: false });

        const inWishlist = user.wishlist.includes(productId);
        res.json({ success: true, inWishlist });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// 🟢 ROUTE: Forgot Password - Send OTP
app.post('/api/forgot-password-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required!" });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "Eh Email database vich nahi mili. Kripya sahi email bharo." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[email] = otp;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'ReSell - Reset Your Password',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
                    <h2 style="color: #4ca154;">Password Reset Request</h2>
                    <p>Here is your OTP to reset your ReSell password:</p>
                    <h1 style="background: #f8fafc; padding: 10px; display: inline-block; border-radius: 8px;">${otp}</h1>
                    <p>If you didn't request this, please ignore this email.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📩 Password Reset OTP sent to ${email}`);
        res.json({ success: true, message: "OTP sent to your email!" });

    } catch (error) {
        console.error("Forgot Pass OTP Error:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP." });
    }
});

// 🟢 ROUTE: Reset Password (Save to MongoDB)
app.post('/api/reset-password', async (req, res) => {
    const { email, newPassword, otp } = req.body;

    if (otpStore[email] !== otp) {
        return res.status(400).json({ success: false, message: "Invalid or expired OTP!" });
    }

    try {
        await User.findOneAndUpdate({ email }, { password: newPassword });
        delete otpStore[email];
        console.log(`✅ Password reset successful for: ${email}`);
        res.json({ success: true, message: "Password updated successfully! You can now login." });
    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ success: false, message: "Failed to update password." });
    }
});

// 🟢 Send OTP to Email
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required!" });

    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[email] = otp;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'ReSell - Registration OTP',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
                    <h2 style="color: #4ca154;">Welcome to ReSell!</h2>
                    <p>Your One Time Password (OTP) for registration is:</p>
                    <h1 style="background: #f8fafc; padding: 10px; display: inline-block; border-radius: 8px;">${otp}</h1>
                    <p>This OTP is valid for the next 5 minutes.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`📩 OTP sent to ${email}`);
        res.json({ success: true, message: "OTP sent successfully!" });

    } catch (error) {
        console.error("OTP Error:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP." });
    }
});

// 🟢 Verify Email OTP Live (6-box)
app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    if (otpStore[email] && otpStore[email] === otp) {
        res.json({ success: true, message: "OTP Verified!" });
    } else {
        res.status(400).json({ success: false, message: "Invalid OTP" });
    }
});

// 🟢 Register User
app.post('/api/register', async (req, res) => {
    const { name, email, password, otp } = req.body;

    if (otpStore[email] !== otp) {
        return res.status(400).json({ success: false, message: "Invalid or expired OTP!" });
    }

    try {
        const newUser = new User({ name, email, password });
        await newUser.save();
        delete otpStore[email];
        console.log(`✅ New user registered: ${name}`);
        res.json({ success: true, message: "Account created successfully!" });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ success: false, message: "Registration failed." });
    }
});

// 🟢 Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ success: false, message: "Account does not exist. Please sign up first." });
        if (user.password !== password) return res.status(401).json({ success: false, message: "Invalid password! Please try again." });

        console.log(`🔑 User logged in: ${user.name}`);
        res.json({ success: true, message: "Login successful!", userName: user.name });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Login failed." });
    }
});

// 🟢 ROUTE: Add New Product to MongoDB (NAVA ADD KITA)
app.post('/api/add-product', async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        console.log(`✅ New product added: ${newProduct.title}`);
        res.json({ success: true, message: "Product saved to MongoDB!" });
    } catch (error) {
        console.error("Error saving product:", error);
        res.status(500).json({ success: false, message: "Failed to save product" });
    }
});

// 🟢 ROUTE: Get All Products from MongoDB
app.get('/api/get-products', async (req, res) => {
    try {
        // Database cho saare products chakko te navay (newest) pehla rakho
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({ success: true, products });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ success: false, message: "Failed to fetch products" });
    }
});

// 🟢 ROUTE: Update (Edit) Product in MongoDB
app.post('/api/update-product', async (req, res) => {
    const { id, newPrice, newDesc } = req.body;
    try {
        await Product.findByIdAndUpdate(id, { price: newPrice, desc: newDesc });
        res.json({ success: true, message: "Product updated successfully!" });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ success: false, message: "Failed to update product" });
    }
});

// 🟢 ROUTE: Delete Product from MongoDB
app.post('/api/delete-product', async (req, res) => {
    const { id } = req.body;
    try {
        await Product.findByIdAndDelete(id);
        res.json({ success: true, message: "Product deleted successfully!" });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ success: false, message: "Failed to delete product" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is flying on http://localhost:${PORT}`);
});