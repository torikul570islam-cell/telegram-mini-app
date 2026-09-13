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

// ইউজার স্কিমা (প্রোফাইল, পয়েন্ট, স্কিপড ও কমপ্লিটেড টাস্ক ট্র্যাক করার জন্য)
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 50 },
    completedTasks: [{ type: mongoose.Schema.Types.ObjectId }],
    skippedTasks: [{ type: mongoose.Schema.Types.ObjectId }],
    isAdmin: { type: Boolean, default: false } // এডমিন কন্ট্রোল
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
            // প্রথম ইউজারের ক্ষেত্রে প্রথমজনকে এডমিন বানিয়ে দিতে পারেন বা ডিফল্ট রাখতে পারেন
            user = new User({ telegramId, points: 50 });
            await user.save();
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ২. টাস্ক লিস্ট আনা (যেগুলো কমপ্লিট বা স্কিপ করা হয়নি)
app.get('/api/tasks/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const user = await User.findOne({ telegramId });
        if (!user) return res.json([]);

        const excludeIds = [...user.completedTasks, ...user.skippedTasks];

        // একসাথে মাত্র ২টি টাস্ক দেখানোর জন্য .limit(2) ব্যবহার করা হয়েছে
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

// ৪. টাস্ক কমপ্লিট করা API (পয়েন্ট যোগ হবে এবং অটো লিস্ট থেকে সরে যাবে)
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

// ৫. টেলিগ্রাম স্টার দিয়ে ক্রেডিট বা পয়েন্ট কেনা (Telegram Stars Payment simulation / Integration)
app.post('/api/buy-credits', async (req, res) => {
    try {
        const { telegramId, packageType } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "User not found" });

        let addedPoints = 0;
        if (packageType === 'small') addedPoints = 100;     // যেমন: নির্দিষ্ট স্টার এর বিনিময়ে
        else if (packageType === 'medium') addedPoints = 500;
        else if (packageType === 'large') addedPoints = 1200;

        user.points += addedPoints;
        await user.save();

        res.json({ success: true, points: user.points });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৬. এডমিন প্যানেল: ইউজারকে ফ্রি ক্রেডিট দেওয়ার API
app.post('/api/admin/give-credit', async (req, res) => {
    try {
        const { adminId, targetTelegramId, amount } = req.body;
        const admin = await User.findOne({ telegramId: adminId });

        // সিকিউরিটি চেক: শুধু এডমিন হলে পয়েন্ট দিতে পারবে
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

// ৭. নতুন টাস্ক ক্রিয়েট API
app.post('/api/tasks/create', async (req, res) => {
    try {
        const { telegramId, platform, taskType, link, reward } = req.body;
        const user = await User.findOne({ telegramId });

        if (!user || user.points < reward) {
            return res.status(400).json({ error: "Insufficient points!" });
        }

        user.points -= Number(reward);
        await user.save();

        const newTask = new Task({ platform, taskType, link, reward: Number(reward), ownerId: telegramId });
        await newTask.save();

        res.json({ success: true, points: user.points });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
