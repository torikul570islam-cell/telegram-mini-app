const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(cors());

// আপনার কনফিগার করা ডাটাবেজ ও বট টোকেন
const MONGO_URI = "mongodb+srv://torikul570:Nadira1432@cluster0.m5iatns.mongodb.net/?appName=Cluster0";
const BOT_TOKEN = "8801531798:AAEw7SJhnT1T8x69caPgMncjI6IPBAgWN3Q";

// আপনার নির্দিষ্ট অ্যাডমিন টেলিগ্রাম আইডি
const ADMIN_TELEGRAM_ID = "8351272061";

// ইমেল কনফিগারেশন (নোডমেইলার)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'torikul570islam@gmail.com',
        pass: 'zkqrkaxycksuksbr'
    }
});

// টেলিগ্রাম বট পোলিং মোডে চালু করা
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// মঙ্গোডিবি কানেকশন
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// ইউজার স্কিমা
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    email: { type: String, default: "" },
    points: { type: Number, default: 50 },
    stars: { type: Number, default: 0 },
    completedTasks: [{ type: mongoose.Schema.Types.ObjectId }],
    skippedTasks: [{ type: mongoose.Schema.Types.ObjectId }],
    isAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    reportCount: { type: Number, default: 0 },
    password: { type: String, default: "" },
    lastDailyBonus: { type: Date, default: null },
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

// টাস্ক স্কিমা
const TaskSchema = new mongoose.Schema({
    platform: String,     // যেমন: telegram, youtube ইত্যাদি
    taskType: String,     // যেমন: join, subscribe ইত্যাদি
    link: String,         // চ্যানেল লিংক বা ইউজারনেম (যেমন: @mychannel বা https://t.me/mychannel)
    reward: { type: Number, default: 10 },
    ownerId: String,
    completedCount: { type: Number, default: 0 },
    completedBy: [{
        userId: String,
        telegramId: String
    }],
    clickTimes: { type: Map, of: Date, default: {} }
});
const Task = mongoose.model('Task', TaskSchema);

// সাহায্যকারী ফাংশন: লিংক থেকে টেলিগ্রাম চ্যানেল Username বা ID বের করার জন্য
function extractTelegramChannelUsername(link) {
    if (!link) return null;
    let cleanLink = link.trim();
    if (cleanLink.startsWith('@')) {
        return cleanLink;
    }
    // যদি https://t.me/username হয়
    const match = cleanLink.match(/t\.me\/([a-zA-Z0-9_]+)/);
    if (match && match[1]) {
        return '@' + match[1];
    }
    return null;
}

// ইউজার রেজিস্ট্রেশন API
app.post('/api/register', async (req, res) => {
    try {
        const { telegramId, email, referredBy } = req.body;
        if (!telegramId) return res.status(400).json({ success: false, error: "Telegram ID required" });

        let user = await User.findOne({ telegramId });
        if (!user) {
            let validReferrer = null;
            if (referredBy && referredBy !== telegramId) {
                const referrerUser = await User.findOne({ telegramId: referredBy });
                if (referrerUser) {
                    validReferrer = referredBy;
                    referrerUser.referralCount += 1;
                    referrerUser.points += 50; 
                    await referrerUser.save();
                }
            }

            user = new User({ 
                telegramId, 
                email: email || "",
                points: 50, 
                isAdmin: (telegramId === ADMIN_TELEGRAM_ID), 
                referredBy: validReferrer 
            });
            await user.save();
        } else {
            if (email && !user.email) user.email = email;
            if (telegramId === ADMIN_TELEGRAM_ID && !user.isAdmin) user.isAdmin = true;
            await user.save();
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ইউজার প্রোফাইল আনা
app.get('/api/user/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, points: 50, isAdmin: (telegramId === ADMIN_TELEGRAM_ID) });
            await user.save();
        } else {
            if (telegramId === ADMIN_TELEGRAM_ID && !user.isAdmin) {
                user.isAdmin = true;
                await user.save();
            }
        }
        if (user.isBanned) {
            return res.status(403).json({ success: false, error: "Your account has been banned due to reports!" });
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// পাসওয়ার্ড সেট ও পরিবর্তন API
app.post('/api/set-password', async (req, res) => {
    try {
        const { telegramId, password } = req.body;
        await User.findOneAndUpdate({ telegramId }, { password });
        res.json({ success: true, message: "Password set successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ওয়েবসাইট থেকে লগইন
app.post('/api/website-login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await User.findOne({ 
            $or: [{ telegramId: identifier }, { email: identifier }],
            password: password 
        });
        if (!user) return res.status(400).json({ success: false, error: "Invalid ID/Gmail or Password" });
        if (user.isBanned) return res.status(403).json({ success: false, error: "This account is banned!" });
        res.json({ success: true, message: "Login successful", user });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// পাসওয়ার্ড ভুলে গেলে রিকভার
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier) return res.status(400).json({ success: false, error: "Telegram ID or Gmail is required" });
        let user = await User.findOne({ $or: [{ telegramId: identifier }, { email: identifier }] });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        const tempPassword = Math.random().toString(36).slice(-8);
        user.password = tempPassword;
        await user.save();

        if (user.email) {
            transporter.sendMail({
                from: 'torikul570islam@gmail.com',
                to: user.email,
                subject: 'Password Reset - Sub4Sub Bot',
                text: `Your temporary password is: ${tempPassword}`
            });
        }
        if (user.telegramId) {
            await bot.sendMessage(user.telegramId, `🔐 Your temporary password is: ${tempPassword}`).catch(() => {});
        }
        res.json({ success: true, message: "New temporary password sent!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ডেইলি বোনাস
app.post('/api/daily-bonus', async (req, res) => {
    try {
        const { telegramId } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        const now = new Date();
        if (user.lastDailyBonus) {
            const hoursDifference = (now - new Date(user.lastDailyBonus)) / (1000 * 60 * 60);
            if (hoursDifference < 24) {
                const remainingHours = Math.ceil(24 - hoursDifference);
                return res.status(400).json({ success: false, error: `Next bonus in ${remainingHours} hours!` });
            }
        }
        user.points = (user.points || 0) + 5;
        user.lastDailyBonus = now;
        await user.save();
        res.json({ success: true, newBalance: user.points });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// টাস্ক লিস্ট আনা এবং বট অ্যাডমিন ও ওনার ব্যালেন্স চেক (অটো হাইড ফিচার)
app.get('/api/tasks/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const user = await User.findOne({ telegramId });
        if (!user || user.isBanned) return res.json([]);

        const excludeIds = [...user.completedTasks, ...user.skippedTasks];
        const allTasks = await Task.find({ ownerId: { $ne: telegramId }, _id: { $nin: excludeIds } });

        let validTasks = [];
        for (let task of allTasks) {
            const owner = await User.findOne({ telegramId: task.ownerId });
            if (!owner || owner.points < task.reward) continue; // ওনারের পর্যাপ্ত পয়েন্ট না থাকলে স্কিপ

            // যদি প্ল্যাটফর্ম টেলিগ্রাম হয়, চেক করবো বট চ্যানেলে অ্যাডমিন আছে কিনা
            if (task.platform.toLowerCase() === 'telegram') {
                const channelUsername = extractTelegramChannelUsername(task.link);
                if (channelUsername) {
                    try {
                        const botMember = await bot.getChatMember(channelUsername, (await bot.getMe()).id);
                        // যদি বট অ্যাডমিন বা ক্রিয়েটর না হয়, তবে টাস্ক হাইড থাকবে
                        if (!['administrator', 'creator'].includes(botMember.status)) {
                            continue; 
                        }
                    } catch (e) {
                        // বট চ্যানেলে যুক্ত না থাকলে বা চ্যাট না পেলে টাস্ক দেখাবে না
                        continue;
                    }
                }
            }

            validTasks.push(task);
        }
        res.json(validTasks.slice(0, 2));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ইউজারের নিজের টাস্ক
app.get('/api/my-tasks/:telegramId', async (req, res) => {
    try {
        const tasks = await Task.find({ ownerId: req.params.telegramId });
        res.json(tasks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// টাস্ক ডিলিট
app.delete('/api/tasks/delete/:taskId', async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.taskId);
        res.json({ success: true, message: "Task deleted successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// টাস্ক স্কিপ
app.post('/api/tasks/skip', async (req, res) => {
    try {
        const { telegramId, taskId } = req.body;
        const user = await User.findOne({ telegramId });
        if (user && !user.skippedTasks.includes(taskId)) {
            user.skippedTasks.push(taskId);
            await user.save();
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// লিংকে ক্লিক করার সময় রেকর্ড করা
app.post('/api/tasks/click', async (req, res) => {
    try {
        const { telegramId, taskId } = req.body;
        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ success: false, error: "Task not found" });

        if (!task.clickTimes) task.clickTimes = new Map();
        task.clickTimes.set(telegramId, new Date());
        await task.save();

        res.json({ success: true, message: "Click recorded" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// টাস্ক কমপ্লিট করার API (৫ সেকেন্ড চেক + টেলিগ্রাম চ্যানেল মেম্বারশিপ API চেক)
app.post('/api/tasks/complete', async (req, res) => {
    try {
        const { telegramId, taskId } = req.body;
        const user = await User.findOne({ telegramId });
        const task = await Task.findById(taskId);

        if (!user || !task) return res.status(404).json({ success: false, error: "Task or User not found" });
        if (user.isBanned) return res.status(403).json({ success: false, error: "Your account is banned!" });

        if (user.completedTasks.includes(taskId)) {
            return res.status(400).json({ success: false, error: "Task already completed" });
        }

        // ৫ সেকেন্ড সময় পার হয়েছে কিনা চেক
        const clickTime = task.clickTimes && task.clickTimes.get(telegramId);
        if (!clickTime) {
            return res.status(400).json({ success: false, error: "Please click the task link first!" });
        }

        const timeDiffSeconds = (new Date() - new Date(clickTime)) / 1000;
        if (timeDiffSeconds < 5) {
            return res.status(400).json({ 
                success: false, 
                error: "You confirmed too fast! You must spend at least 5 seconds. Task expired for you." 
            });
        }

        // যদি টেলিগ্রাম টাস্ক হয়, তবে টেলিগ্রাম API দিয়ে চেক করবো ইউজার চ্যানেলে জয়েন করেছে কিনা
        if (task.platform.toLowerCase() === 'telegram') {
            const channelUsername = extractTelegramChannelUsername(task.link);
            if (channelUsername) {
                try {
                    const member = await bot.getChatMember(channelUsername, telegramId);
                    const validStatuses = ['member', 'administrator', 'creator'];
                    if (!validStatuses.includes(member.status)) {
                        return res.status(400).json({ 
                            success: false, 
                            error: "Verification failed! You have not joined the channel yet." 
                        });
                    }
                } catch (err) {
                    return res.status(400).json({ 
                        success: false, 
                        error: "Could not verify your membership. Make sure you joined the channel." 
                    });
                }
            }
        }

        const taskOwner = await User.findOne({ telegramId: task.ownerId });
        if (!taskOwner || taskOwner.points < task.reward) {
            return res.status(400).json({ success: false, error: "Task owner has insufficient balance. Task expired." });
        }

        taskOwner.points -= task.reward;
        await taskOwner.save();

        user.completedTasks.push(taskId);
        user.points += task.reward;
        await user.save();

        task.completedCount = (task.completedCount || 0) + 1;
        task.completedBy.push({ userId: user._id, telegramId: user.telegramId });
        await task.save();

        res.json({ success: true, points: user.points });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// টাস্ক রিপোর্ট করার API
app.post('/api/tasks/report', async (req, res) => {
    try {
        const { taskId, reportedTelegramId } = req.body;
        const targetUser = await User.findOne({ telegramId: reportedTelegramId });
        if (!targetUser) return res.status(404).json({ success: false, error: "User not found" });

        targetUser.reportCount = (targetUser.reportCount || 0) + 1;
        if (targetUser.reportCount >= 10) {
            targetUser.isBanned = true;
        }
        await targetUser.save();

        res.json({ success: true, message: "User reported successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// টাস্ক ক্রিয়েট করার API (বট চ্যানেলে অ্যাডমিন আছে কিনা চেক করে টাস্ক তৈরি করবে)
app.post('/api/tasks/create', async (req, res) => {
    try {
        const { telegramId, platform, taskType, link, reward } = req.body;
        if (Number(reward) < 5) return res.status(400).json({ success: false, error: "Minimum reward is 5 points!" });

        // যদি টেলিগ্রাম টাস্ক হয়, চেক করবো বট চ্যানেলের অ্যাডমিন কিনা
        if (platform && platform.toLowerCase() === 'telegram') {
            const channelUsername = extractTelegramChannelUsername(link);
            if (channelUsername) {
                try {
                    const botMember = await bot.getChatMember(channelUsername, (await bot.getMe()).id);
                    if (!['administrator', 'creator'].includes(botMember.status)) {
                        return res.status(400).json({ 
                            success: false, 
                            error: "Bot is not an admin in your Telegram channel! Please add the bot as an admin first." 
                        });
                    }
                } catch (e) {
                    return res.status(400).json({ 
                        success: false, 
                        error: "Unable to verify bot as admin. Check the channel username/link and ensure the bot is added as admin." 
                    });
                }
            }
        }

        const newTask = new Task({
            platform, taskType, link, reward: Number(reward), ownerId: telegramId, completedCount: 0
        });

        await newTask.save();
        res.json({ success: true, message: "Task created successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// অ্যাডমিন প্যানেল: রিপোর্ট হওয়া ইউজারদের তালিকা
app.get('/api/admin/reported-users', async (req, res) => {
    try {
        const reportedUsers = await User.find({ reportCount: { $gt: 0 } }).select('telegramId email points reportCount isBanned');
        res.json(reportedUsers);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// অ্যাডমিন প্যানেল: ইউজার ম্যানেজমেন্ট (রিসেট রিপোর্ট, ব্যান, আনবান)
app.post('/api/admin/manage-user', async (req, res) => {
    try {
        const { telegramId, action } = req.body; 
        let user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        if (action === 'clear_reports') {
            user.reportCount = 0;
            user.isBanned = false;
        } else if (action === 'ban') {
            user.isBanned = true;
        } else if (action === 'unban') {
            user.isBanned = false;
            user.reportCount = 0;
        }

        await user.save();
        res.json({ success: true, message: `Action ${action} executed successfully!` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// এডমিন প্যানেল: সরাসরি ইউজারকে ক্রেডিট পাঠানো
app.post('/api/admin/give-credit', async (req, res) => {
    try {
        const { telegramId, targetUserId, targetTelegramId, amount } = req.body;
        const recipientId = targetUserId || targetTelegramId;
        
        if (!recipientId || !amount) {
            return res.status(400).json({ success: false, error: "Target User ID and Amount are required!" });
        }

        let targetUser = await User.findOne({ telegramId: recipientId });
        if (!targetUser) return res.status(404).json({ success: false, error: "Target user not found!" });

        targetUser.points += Number(amount);
        await targetUser.save();

        res.json({ success: true, newBalance: targetUser.points });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
