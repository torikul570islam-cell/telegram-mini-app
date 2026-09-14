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

// ইউজার স্কিমা (রেফারেল, স্টার ও উইথড্র ফিল্ডসহ)
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 50 },
    stars: { type: Number, default: 0 },
    completedTasks: [{ type: mongoose.Schema.Types.ObjectId }],
    skippedTasks: [{ type: mongoose.Schema.Types.ObjectId }],
    isAdmin: { type: Boolean, default: false },
    password: { type: String, default: "" },
    lastDailyBonus: { type: Date, default: null },
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 }
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

// ইউজার রেজিস্ট্রেশন ও রেফারেল হ্যান্ডেল করার API
app.post('/api/register', async (req, res) => {
    try {
        const { telegramId, referredBy } = req.body;
        if (!telegramId) return res.status(400).json({ success: false, error: "Telegram ID required" });

        let user = await User.findOne({ telegramId });
        if (!user) {
            const isFirstUser = (await User.countDocuments()) === 0;
            let validReferrer = null;

            if (referredBy && referredBy !== telegramId) {
                const referrerUser = await User.findOne({ telegramId: referredBy });
                if (referrerUser) {
                    validReferrer = referredBy;
                    referrerUser.referralCount += 1;
                    referrerUser.points += 10; 
                    await referrerUser.save();
                }
            }

            user = new User({ 
                telegramId, 
                points: 50, 
                isAdmin: isFirstUser, 
                referredBy: validReferrer 
            });
            await user.save();
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

// ওয়েবসাইট থেকে লগইন করার API
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

// ডেইলি বোনাস API (প্রতি ২৪ ঘণ্টায় ৫ পয়েন্ট)
app.post('/api/daily-bonus', async (req, res) => {
    try {
        const { telegramId } = req.body;
        if (!telegramId) return res.status(400).json({ success: false, error: "Telegram ID is required" });

        let user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        const now = new Date();
        if (user.lastDailyBonus) {
            const lastBonusTime = new Date(user.lastDailyBonus);
            const hoursDifference = (now - lastBonusTime) / (1000 * 60 * 60);

            if (hoursDifference < 24) {
                const remainingHours = Math.ceil(24 - hoursDifference);
                return res.status(400).json({ 
                    success: false, 
                    error: `You can claim your next bonus in about ${remainingHours} hours!` 
                });
            }
        }

        user.points = (user.points || 0) + 5;
        user.lastDailyBonus = now;
        await user.save();

        res.json({ success: true, newBalance: user.points });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// টেলিগ্রাম স্টার ইনভয়েস API
app.post('/api/create-invoice', async (req, res) => {
    try {
        const { telegramId, packageType } = req.body;
        
        let title = "";
        let description = "";
        let amount = 0;
        let points = 0;

        if (packageType === 'small') {
            title = "100 Points";
            description = "Get 100 points for Like4Like tasks";
            amount = 5;
            points = 100;
        } else if (packageType === 'medium') {
            title = "500 Points";
            description = "Get 500 points for Like4Like tasks";
            amount = 20;
            points = 500;
        } else if (packageType === 'large') {
            title = "1200 Points";
            description = "Get 1200 points for Like4Like tasks";
            amount = 40;
            points = 1200;
        } else {
            return res.status(400).json({ success: false, error: "Invalid package type" });
        }

        const invoiceLink = await bot.createInvoiceLink(
            title,
            description,
            JSON.stringify({ telegramId, points, amount }),
            "",
            "XTR",
            [{ label: title, amount: amount }]
        );

        res.json({ success: true, invoiceLink });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// প্রি-চেকআউট হ্যান্ডলার
bot.on('pre_checkout_query', async (query) => {
    try {
        await bot.answerPreCheckoutQuery(query.id, true);
    } catch (err) {
        console.error(err);
    }
});

// পেমেন্ট সফল হওয়ার পর পয়েন্ট এবং ৩০% রেফারেল স্টার কমিশন যোগ করা
bot.on('successful_payment', async (msg) => {
    try {
        const paymentInfo = msg.successful_payment;
        const payload = JSON.parse(paymentInfo.invoice_payload);
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

            await bot.sendMessage(telegramId, `✅ Payment successful! ${points} points have been added to your account.`);
        }
    } catch (err) {
        console.error("Payment error:", err);
    }
});

// উইথড্র রিকোয়েস্ট API (নোডমেইলার সহ)
app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, method, account, amount } = req.body;
        
        if (!telegramId || !method || !account || !amount) {
            return res.status(400).json({ success: false, error: "All fields are required!" });
        }

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

        const mailOptions = {
            from: 'torikul570islam@gmail.com',
            to: 'torikul570islam@gmail.com',
            subject: 'New Star Withdrawal Request!',
            text: `A new withdrawal request has been submitted:\n\n- Telegram ID: ${telegramId}\n- Method: ${method.toUpperCase()}\n- Account: ${account}\n- Amount: ${amount} Stars`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Email send error:", error);
            } else {
                console.log("Withdrawal email sent: " + info.response);
            }
        });

        res.json({ success: true, message: "Withdrawal request submitted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// টাস্ক লিস্ট আনা
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

// টাস্ক স্কিপ করা API
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

// টাস্ক কমপ্লিট করা API
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

// টাস্ক ক্রিয়েট করার API
app.post('/api/tasks/create', async (req, res) => {
    try {
        const { telegramId, platform, taskType, link, reward } = req.body;
        
        if (Number(reward) < 5) {
            return res.status(400).json({ success: false, error: "Minimum reward must be at least 5 points!" });
        }

        const newTask = new Task({
            platform,
            taskType,
            link,
            reward: Number(reward),
            ownerId: telegramId
        });

        await newTask.save();
        res.json({ success: true, message: "Task created successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// এডমিন প্যানেল: ইউজারকে ফ্রি ক্রেডিট দেওয়ার API
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
