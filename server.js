const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://your_mongo_connection_string";

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// ইউজার স্কিমা (পাসওয়ার্ড ফিল্ড সহ আপডেট করা)
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 50 },
    completedTasks: [{ type: mongoose.Schema.Types.ObjectId }],
    skippedTasks: [{ type: mongoose.Schema.Types.ObjectId }],
    isAdmin: { type: Boolean, default: false }, // এডমিন কন্ট্রোল
    password: { type: String, default: "" } // নতুন পাসওয়ার্ড ফিল্ড
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    platform: String,
    taskType: String,
    link: String,
    reward: { type: Number, default: 10 },
    ownerId: String
});
const Task = mongoose.model('Task', TaskSchema);

// ১. ইউজার প্রোফাইল ও ডাটা আনা
app.get('/api/user/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        let user = await User.findOne({ telegramId });
        if (!user) {
            const isFirstUser = (await User.countDocuments()) === 0;
            user = new User({ telegramId, points: 50, isAdmin: isFirstUser });
            await user.save();
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// পাসওয়ার্ড সেট করার API
app.post('/api/set-password', async (req, res) => {
    try {
        const { telegramId, password } = req.body;
        await User.findOneAndUpdate({ telegramId }, { password });
        res.json({ success: true, message: "Password set successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// পাসওয়ার্ড পরিবর্তনের API
app.post('/api/change-password', async (req, res) => {
    try {
        const { telegramId, oldPassword, newPassword } = req.body;
        const user = await User.findOne({ telegramId });
        
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        
        if (user.password && user.password !== oldPassword) {
            return res.status(400).json({ success: false, error: "Incorrect old password" });
        }

        user.password = newPassword;
        await user.save();
        res.json({ success: true, message: "Password changed successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// মূল ওয়েবসাইট থেকে লগইন করার API
app.post('/api/website-login', async (req, res) => {
    try {
        const { telegramId, password } = req.body;
        const user = await User.findOne({ telegramId, password });
        if (!user) return res.status(400).json({ success: false, error: "Invalid Telegram ID or Password" });
        
        res.json({ success: true, message: "Login successful", user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ফর্গেট পাসওয়ার্ড রিকভারি API (নতুন যুক্ত করা হলো)
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { telegramId } = req.body;
        const user = await User.findOne({ telegramId });

        if (!user) {
            return res.status(404).json({ success: false, error: "User not found with this Telegram ID!" });
        }

        // ৬ ডিজিটের একটি নতুন অস্থায়ী পাসওয়ার্ড তৈরি করা
        const newPassword = Math.random().toString(36).slice(-6);
        user.password = newPassword; 
        await user.save();

        res.json({ 
            success: true, 
            message: "Temporary password generated successfully.", 
            tempPassword: newPassword 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ২. টাস্ক লিস্ট আনা
app.get('/api/tasks/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const user = await User.findOne({ telegramId });
        if (!user) return res.json([]);

        const excludeIds = [...user.completedTasks, ...user.skippedTasks];

        const tasks = await Task.find({ 
            ownerId: { $ne: telegramId }, 
            _id: { $nin: excludeIds } 
        }).limit(2);

        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৩. টাস্ক স্কিপ করা API
app.post('/api/tasks/skip', async (req, res) => {
    try {
        const { telegramId, taskId } = req.body;
        const user = await User.findOne({ telegramId });
        if (user && !user.skippedTasks.includes(taskId)) {
            user.skippedTasks.push(taskId);
            await user.save();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৪. টাস্ক কমপ্লিট করা API
app.post('/api/tasks/complete', async (req, res) => {
    try {
        const { telegramId, taskId } = req.body;
        const user = await User.findOne({ telegramId });
        const task = await Task.findById(taskId);

        if (!user || !task) return res.status(404).json({ error: "Not found" });

        if (!user.completedTasks.includes(taskId)) {
            user.completedTasks.push(taskId);
            user.points += task.reward;
            await user.save();
        }

        res.json({ success: true, points: user.points });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৫. টেলিগ্রাম স্টার দিয়ে ক্রেডিট বা পয়েন্ট কেনা
app.post('/api/buy-credits', async (req, res) => {
    try {
        const { telegramId, packageType } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "User not found" });

        let addedPoints = 0;
        if (packageType === 'small') addedPoints = 100;     
        else if (packageType === 'medium') addedPoints = 500;
        else if (packageType === 'large') addedPoints = 1200;

        user.points += addedPoints;
        await user.save();

        res.json({ success: true, points: user.points });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৬. এডমিন প্যানেল: ইউজারকে ফ্রি ক্রেডিট দেওয়ার API
app.post('/api/admin/give-credit', async (req, res) => {
    try {
        const { adminId, targetTelegramId, amount } = req.body;
        const admin = await User.findOne({ telegramId: adminId });

        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ error: "Unauthorized! Admin only." });
        }

        const targetUser = await User.findOne({ telegramId: targetTelegramId });
        if (!targetUser) return res.status(404).json({ error: "Target user not found!" });

        targetUser.points += Number(amount);
        await targetUser.save();

        res.json({ success: true, newBalance: targetUser.points });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
