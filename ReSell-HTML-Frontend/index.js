const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 Limit 500MB kitti hai taaki kinniyan vi waddiyan photos hon, crash na hove!
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use(cors());

const frontendPath = __dirname;
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
    wishlist: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// 2. Product Schema
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
    sellerEmail: { type: String },
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
    res.sendFile(path.join(frontendPath, 'index'));
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

// 🟢 Toggle Wishlist (Add/Remove)
app.post('/api/toggle-wishlist', async (req, res) => {
    const { email, productId } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const index = user.wishlist.indexOf(productId);
        if (index > -1) {
            user.wishlist.splice(index, 1);
            await user.save();
            return res.json({ success: true, action: 'removed' });
        } else {
            user.wishlist.push(productId);
            await user.save();
            return res.json({ success: true, action: 'added' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 🟢 Get all products in User's Wishlist
app.post('/api/get-wishlist', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: false, message: "User not found" });

        const products = await Product.find({ _id: { $in: user.wishlist } });
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error fetching wishlist" });
    }
});

// 🟢 Check Wishlist Status
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

// 🟢 Forgot Password - Send OTP
app.post('/api/forgot-password-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required!" });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "Email not found in database." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore[email] = otp;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'ReSell - Reset Your Password',
            html: `<div style="text-align: center;"><h2>Password Reset</h2><h1>${otp}</h1></div>`
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "OTP sent to your email!" });

    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to send OTP." });
    }
});

// 🟢 Reset Password
app.post('/api/reset-password', async (req, res) => {
    const { email, newPassword, otp } = req.body;
    if (otpStore[email] !== otp) return res.status(400).json({ success: false, message: "Invalid OTP!" });

    try {
        await User.findOneAndUpdate({ email }, { password: newPassword });
        delete otpStore[email]; // OTP verify hon ton baad memory vicho uda dao
        res.json({ success: true, message: "Password updated successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to update password." });
    }
});

// 🟢 Send OTP for Registration
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
            html: `<div style="text-align: center;"><h2>Registration OTP</h2><h1>${otp}</h1></div>`
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "OTP sent successfully!" });

    } catch (error) {
        console.error("🚨 NODEMAILER ERROR DETAILS: 🚨", error);
        res.status(500).json({
            success: false,
            message: "Failed to send OTP.",
            actual_error: error.message || error.toString()
        });
    }
});

// 🟢 Verify OTP for Registration (NAWA ROUTE)
app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    // Check karda aa ki memory vich oh OTP hai te match hunda aa ya nahi
    if (otpStore[email] && otpStore[email] === otp) {
        res.json({ success: true, message: "OTP verified successfully!" });
    } else {
        res.status(400).json({ success: false, message: "Invalid OTP!" });
    }
});

// 🟢 Register User
app.post('/api/register', async (req, res) => {
    const { name, email, password, otp } = req.body;

    // Safety check: Database vich bhejkan ton pehla final OTP check
    // if (otpStore[email] !== otp) {
    //     return res.status(400).json({ success: false, message: "Invalid or expired OTP!" });
    // }

    try {
        const newUser = new User({ name, email, password });
        await newUser.save();
        // delete otpStore[email]; // Account banan ton baad OTP clear kardo
        res.json({ success: true, message: "Account created successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Registration failed." });
    }
});

// 🟢 Login Route
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "Account does not exist." });
        if (user.password !== password) return res.status(401).json({ success: false, message: "Invalid password!" });

        res.json({ success: true, message: "Login successful!", userName: user.name });
    } catch (error) {
        res.status(500).json({ success: false, message: "Login failed." });
    }
});

// 🟢 ROUTE: Add New Product 
app.post('/api/add-product', async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        await newProduct.save();
        res.json({ success: true, message: "Product saved to MongoDB!" });
    } catch (error) {
        res.status(500).json({ success: false, message: `Backend Error: ${error.message}` });
    }
});

// 🟢 ROUTE: Get All Products
app.get('/api/get-products', async (req, res) => {
    try {
        const products = await Product.find().sort({ _id: -1 }).lean();
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, message: `Failed to fetch: ${error.message}` });
    }
});

// 🟢 Delete Product
app.post('/api/delete-product', async (req, res) => {
    const { id } = req.body;
    try {
        await Product.findByIdAndDelete(id);
        res.json({ success: true, message: "Product deleted successfully!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to delete product" });
    }
});

// Vercel ke liye server export karna zaroori hai
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`🚀 Local Server running on port ${PORT}`));
}

module.exports = app;