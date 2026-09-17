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

// ইউজার স্কিমা (সব ফিল্ড সহ)
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
    platform: String,     
    taskType: String,     
    link: String,         
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
    const match = cleanLink.match(/t\.me\/([a-zA-Z0-9_]+)/);
    if (match && match[1]) {
        return '@' + match[1];
    }
    return null;
}

// ==========================================
// টেলিগ্রাম বট /start কমান্ড এবং রেফারেল হ্যান্ডলার
// ==========================================
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = chatId.toString();
    const referrerArg = match[1] ? match[1].trim() : null;

    try {
        let user = await User.findOne({ telegramId });

        if (!user) {
            let validReferrer = null;
            if (referrerArg && referrerArg !== telegramId) {
                const referrerUser = await User.findOne({ telegramId: referrerArg });
                if (referrerUser) {
                    validReferrer = referrerArg;
                    referrerUser.referralCount += 1;
                    referrerUser.points += 50; 
                    await referrerUser.save();

                    await bot.sendMessage(referrerUser.telegramId, `🎉 Your friend joined via your referral link! You earned 50 bonus points.`);
                }
            }

            user = new User({
                telegramId,
                points: 50,
                isAdmin: (telegramId === ADMIN_TELEGRAM_ID),
                referredBy: validReferrer
            });
            await user.save();
        } else {
            if (telegramId === ADMIN_TELEGRAM_ID && !user.isAdmin) {
                user.isAdmin = true;
                await user.save();
            }
        }

        const webAppUrl = "https://telegram-mini-app-8y39.onrender.com"; // আপনার ফ্রন্টএন্ড লিংক
        await bot.sendMessage(chatId, `🔥 Welcome to Like4Like Bot!\n\nEarn points by completing tasks or invite friends to get bonuses.`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 Open Mini App", web_app: { url: webAppUrl } }]
                ]
            }
        });
    } catch (err) {
        console.error("Referral Error:", err);
    }
});

// ইউজার রেজিস্ট্রেশন ও রেফারেল হ্যান্ডেল করার API
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
            if (telegramId === ADMIN_TELEGRAM_ID && !user.isAdmin) {
                user.isAdmin = true;
                await user.save();
            }
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ইউজার প্রোফাইল ও ডাটা আনা
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

// পাসওয়ার্ড সেট করার API
app.post('/api/set-password', async (req, res) => {
    try {
        const { telegramId, password } = req.body;
        await User.findOneAndUpdate({ telegramId }, { password });
        res.json({ success: true, message: "Password set successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ওয়েবসাইট থেকে লগইন করার API (Telegram ID অথবা Gmail দিয়ে লগইন)
app.post('/api/website-login', async (req, res) => {
    try {
        const { identifier, password, telegramId } = req.body;
        const loginId = identifier || telegramId;

        const user = await User.findOne({ 
            $or: [{ telegramId: loginId }, { email: loginId }],
            password: password 
        });
        if (!user) return res.status(400).json({ success: false, error: "Invalid ID/Gmail or Password" });
        if (user.isBanned) return res.status(403).json({ success: false, error: "This account is banned!" });

        res.json({ success: true, message: "Login successful", user });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// পাসওয়ার্ড ভুলে গেলে রিকভার করার API
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { identifier, telegramId, email } = req.body;
        const targetId = identifier || telegramId || email;
        if (!targetId) return res.status(400).json({ success: false, error: "Telegram ID or Gmail is required" });

        let user = await User.findOne({ $or: [{ telegramId: targetId }, { email: targetId }] });
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

// ডেইলি বোনাস API (প্রতি ২৪ ঘণ্টায় ৫ পয়েন্ট)
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

// টেলিগ্রাম স্টার ইনভয়েস API
app.post('/api/create-invoice', async (req, res) => {
    try {
        const { telegramId, packageType } = req.body;
        let title = "", description = "", amount = 0, points = 0;

        if (packageType === 'small') {
            title = "100 Points"; description = "Get 100 points for Like4Like tasks"; amount = 10; points = 100;
        } else if (packageType === 'medium') {
            title = "500 Points"; description = "Get 500 points for Like4Like tasks"; amount = 40; points = 500;
        } else if (packageType === 'large') {
            title = "1200 Points"; description = "Get 1200 points for Like4Like tasks"; amount = 99; points = 1200;
        } else {
            return res.status(400).json({ success: false, error: "Invalid package type" });
        }

        const invoiceLink = await bot.createInvoiceLink(
            title, description, JSON.stringify({ telegramId, points, amount }), "", "XTR", [{ label: title, amount: amount }]
        );
        res.json({ success: true, invoiceLink });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

bot.on('pre_checkout_query', async (query) => {
    try { await bot.answerPreCheckoutQuery(query.id, true); } catch (e) { console.error(e); }
});

bot.on('successful_payment', async (msg) => {
    try {
        const payload = JSON.parse(msg.successful_payment.invoice_payload);
        const { telegramId, points, amount } = payload;
        let user = await User.findOne({ telegramId });
        if (user) {
            user.points += points;
            await user.save();

            if (user.referredBy) {
                let referrer = await User.findOne({ telegramId: user.referredBy });
                if (referrer) {
                    let commissionStars = Math.floor(amount * 0.30);
                    if (commissionStars > 0) {
                        referrer.stars += commissionStars;
                        await referrer.save();
                        await bot.sendMessage(referrer.telegramId, `🎉 You received ${commissionStars} Stars commission from your referral's purchase!`);
                    }
                }
            }
            await bot.sendMessage(telegramId, `✅ Payment successful! ${points} points added.`);
        }
    } catch (err) { console.error(err); }
});

// উইথড্র রিকোয়েস্ট API
app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, method, account, amount } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        if (Number(amount) < 500) {
            return res.status(400).json({ success: false, error: "Minimum withdrawal amount is 500 Stars!" });
        }
        if (user.stars < Number(amount)) {
            return res.status(400).json({ success: false, error: "Insufficient Star balance!" });
        }

        user.stars -= Number(amount);
        await user.save();

        transporter.sendMail({
            from: 'torikul570islam@gmail.com',
            to: 'torikul570islam@gmail.com',
            subject: 'New Star Withdrawal Request!',
            text: `Telegram ID: ${telegramId}\nMethod: ${method}\nAccount: ${account}\nAmount: ${amount} Stars`
        });

        res.json({ success: true, message: "Withdrawal request submitted successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// টাস্ক লিস্ট আনা
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
            if (!owner || owner.points < task.reward) continue;

            if (task.platform.toLowerCase() === 'telegram') {
                const channelUsername = extractTelegramChannelUsername(task.link);
                if (channelUsername) {
                    try {
                        const botMember = await bot.getChatMember(channelUsername, (await bot.getMe()).id);
                        if (!['administrator', 'creator'].includes(botMember.status)) continue;
                    } catch (e) { continue; }
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

// লিংকে ক্লিক রেকর্ড করার API
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

// টাস্ক কমপ্লিট করার API
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

        const clickTime = task.clickTimes && task.clickTimes.get(telegramId);
        if (!clickTime) {
            return res.status(400).json({ success: false, error: "Please click the task link first!" });
        }
        const timeDiffSeconds = (new Date() - new Date(clickTime)) / 1000;
        if (timeDiffSeconds < 6) {
            return res.status(400).json({ success: false, error: "make sure tast is complete!." });
        }

        if (task.platform.toLowerCase() === 'telegram') {
            const channelUsername = extractTelegramChannelUsername(task.link);
            if (channelUsername) {
                try {
                    const member = await bot.getChatMember(channelUsername, telegramId);
                    if (!['member', 'administrator', 'creator'].includes(member.status)) {
                        return res.status(400).json({ success: false, error: "Verification failed! You haven't joined the channel yet." });
                    }
                } catch (err) {
                    return res.status(400).json({ success: false, error: "Could not verify membership. Make sure you joined." });
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// টাস্ক রিপোর্ট করার API
app.post('/api/tasks/report', async (req, res) => {
    try {
        const { reportedTelegramId } = req.body;
        const targetUser = await User.findOne({ telegramId: reportedTelegramId });
        if (!targetUser) return res.status(404).json({ success: false, error: "User not found" });

        targetUser.reportCount = (targetUser.reportCount || 0) + 1;
        if (targetUser.reportCount >= 10) targetUser.isBanned = true;
        await targetUser.save();

        res.json({ success: true, message: "User reported successfully!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// টাস্ক ক্রিয়েট করার API
app.post('/api/tasks/create', async (req, res) => {
    try {
        const { telegramId, platform, taskType, link, reward } = req.body;
        if (Number(reward) < 5) return res.status(400).json({ success: false, error: "Minimum reward is 5 points!" });

        if (platform && platform.toLowerCase() === 'telegram') {
            const channelUsername = extractTelegramChannelUsername(link);
            if (channelUsername) {
                try {
                    const botMember = await bot.getChatMember(channelUsername, (await bot.getMe()).id);
                    if (!['administrator', 'creator'].includes(botMember.status)) {
                        return res.status(400).json({ success: false, error: "Bot is not an admin in your Telegram channel!" });
                    }
                } catch (e) {
                    return res.status(400).json({ success: false, error: "Unable to verify bot as admin in the channel." });
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

// অ্যাডমিন প্যানেল: ইউজার ম্যানেজমেন্ট
app.post('/api/admin/manage-user', async (req, res) => {
    try {
        const { telegramId, action } = req.body;
        let user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        if (action === 'clear_reports') { user.reportCount = 0; user.isBanned = false; }
        else if (action === 'ban') { user.isBanned = true; }
        else if (action === 'unban') { user.isBanned = false; user.reportCount = 0; }

        await user.save();
        res.json({ success: true, message: `Action ${action} executed!` });
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

        if (telegramId && telegramId !== ADMIN_TELEGRAM_ID) {
            const adminCheck = await User.findOne({ telegramId });
            if (!adminCheck || !adminCheck.isAdmin) {
                return res.status(403).json({ success: false, error: "Unauthorized! Admin access required." });
            }
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
