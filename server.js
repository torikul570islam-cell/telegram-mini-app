const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json({ limit: '10mb' })); // বড় স্ক্রিনশট ইমেজ রিসিভ করার জন্য লিমিট বাড়ানো হলো
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

// টাস্ক স্কিমা
const TaskSchema = new mongoose.Schema({
    platform: String,
    taskType: String,
    link: String,
    reward: { type: Number, default: 10 },
    ownerId: String,
    completedCount: { type: Number, default: 0 }
});
const Task = mongoose.model('Task', TaskSchema);

// ১. টেলিগ্রাম টাস্ক ক্রিয়েট পেন্ডিং রিকোয়েস্ট স্কিমা (অ্যাডমিন প্রুফ স্ক্রিনশটসহ)
const TaskCreationRequestSchema = new mongoose.Schema({
    userId: String,
    taskData: {
        platform: { type: String, default: 'telegram' },
        taskType: String,
        link: String,
        reward: Number,
        targetChannelId: String
    },
    proofUrl: String, // স্ক্রিনশট ডাটা বা URL
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    createdAt: { type: Date, default: Date.now }
});
const TaskCreationRequest = mongoose.model('TaskCreationRequest', TaskCreationRequestSchema);

// ২. অন্যান্য প্ল্যাটফর্মের টাস্ক কমপ্লিট প্রুফ সাবমিশন স্কিমা
const TaskSubmissionProofSchema = new mongoose.Schema({
    userId: String,
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    proofUrl: String, // কমপ্লিশন স্ক্রিনশট
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    createdAt: { type: Date, default: Date.now }
});
const TaskSubmissionProof = mongoose.model('TaskSubmissionProof', TaskSubmissionProofSchema);

// ইউজার রেজিস্ট্রেশন ও রেফারেল হ্যান্ডেল করার API
app.post('/api/register', async (req, res) => {
    try {
        const { telegramId, referredBy } = req.body;
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
            user = new User({ 
                telegramId, 
                points: 50, 
                isAdmin: (telegramId === ADMIN_TELEGRAM_ID) 
            });
            await user.save();
        } else {
            if (telegramId === ADMIN_TELEGRAM_ID && !user.isAdmin) {
                user.isAdmin = true;
                await user.save();
            }
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

// পাসওয়ার্ড ভুলে গেলে নতুন পাসওয়ার্ড পাঠানোর API
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { telegramId } = req.body;
        if (!telegramId) return res.status(400).json({ success: false, error: "Telegram ID is required" });

        let user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        const tempPassword = Math.random().toString(36).slice(-8);
        user.password = tempPassword;
        await user.save();

        await bot.sendMessage(telegramId, `🔐 Your password has been reset. Your new temporary password is: ${tempPassword}`);

        res.json({ success: true, message: "New password sent to Telegram!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ডেইলি বোনাস API
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

// পেমেন্ট সফল হওয়ার পর পয়েন্ট এবং রেফারেল স্টার কমিশন যোগ করা
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

// উইথড্র রিকোয়েস্ট API
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
            }
        });

        res.json({ success: true, message: "Withdrawal request submitted successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// টাস্ক লিস্ট আনা
app.get('/api/tasks/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const user = await User.findOne({ telegramId });
        if (!user) return res.json([]);

        const excludeIds = [...user.completedTasks, ...user.skippedTasks];

        const allTasks = await Task.find({ 
            ownerId: { $ne: telegramId }, 
            _id: { $nin: excludeIds } 
        });

        let validTasks = [];
        for (let task of allTasks) {
            const owner = await User.findOne({ telegramId: task.ownerId });
            if (owner && owner.points >= task.reward) {
                validTasks.push(task);
            }
        }

        res.json(validTasks.slice(0, 10));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ইউজারের নিজের টাস্ক লিস্ট আনা
app.get('/api/my-tasks/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const tasks = await Task.find({ ownerId: telegramId });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// টাস্ক ডিলিট করা API
app.delete('/api/tasks/delete/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        await Task.findByIdAndDelete(taskId);
        res.json({ success: true, message: "Task deleted successfully!" });
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

// ৩. টেলিগ্রাম টাস্ক অটো-ভেরিফিকেশন API (বট API দিয়ে মেম্বারশিপ চেক)
app.post('/api/tasks/verify-telegram', async (req, res) => {
    try {
        const { telegramId, taskId } = req.body;
        const user = await User.findOne({ telegramId });
        const task = await Task.findById(taskId);

        if (!user || !task) return res.status(404).json({ success: false, error: "Task or User not found" });

        if (user.completedTasks.includes(taskId)) {
            return res.status(400).json({ success: false, error: "Task already completed" });
        }

        // টাস্কের লিংক বা চ্যানেল আইডি থেকে চ্যাট আইডি বের করা (যেমন: @channel_username বা t.me/channel)
        let chatIdentifier = task.link.trim();
        if (chatIdentifier.includes('t.me/')) {
            chatIdentifier = '@' + chatIdentifier.split('t.me/')[1].split('/')[0];
        }

        // টেলিগ্রাম বট API দিয়ে চেক করা ইউজার চ্যানেলে জয়েন করেছে কি না
        try {
            const chatMember = await bot.getChatMember(chatIdentifier, telegramId);
            const status = chatMember.status;
            const validStatuses = ['creator', 'administrator', 'member'];

            if (!validStatuses.includes(status)) {
                return res.status(400).json({ success: false, error: "You have not joined the channel yet! Please join first." });
            }
        } catch (botErr) {
            console.error("Bot verification error:", botErr);
            return res.status(400).json({ success: false, error: "Could not verify membership. Make sure the bot is an admin in that channel!" });
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
        await task.save();

        res.json({ success: true, message: `Verification successful! +${task.reward} points added.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৪. অন্যান্য প্ল্যাটফর্মের টাস্ক প্রুফ সাবমিট করার API
app.post('/api/tasks/submit-proof', async (req, res) => {
    try {
        const { telegramId, taskId, proofUrl } = req.body;
        if (!telegramId || !taskId || !proofUrl) {
            return res.status(400).json({ success: false, error: "All fields including screenshot proof are required!" });
        }

        const newProof = new TaskSubmissionProof({
            userId: telegramId,
            taskId,
            proofUrl,
            status: 'pending'
        });

        await newProof.save();
        res.json({ success: true, message: "Proof submitted successfully! Admin will review and credit points." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৫. টেলিগ্রাম টাস্ক ক্রিয়েট রিকোয়েস্ট (অ্যাডমিন প্রুফসহ) API
app.post('/api/tasks/create-telegram-request', async (req, res) => {
    try {
        const { telegramId, taskType, link, reward, targetChannelId, proofUrl } = req.body;
        
        if (Number(reward) < 5) {
            return res.status(400).json({ success: false, error: "Minimum reward must be at least 5 points!" });
        }

        if (!proofUrl || !targetChannelId) {
            return res.status(400).json({ success: false, error: "Channel ID and Bot Admin proof screenshot are required!" });
        }

        const newReq = new TaskCreationRequest({
            userId: telegramId,
            taskData: {
                platform: 'telegram',
                taskType,
                link,
                reward: Number(reward),
                targetChannelId
            },
            proofUrl,
            status: 'pending'
        });

        await newReq.save();
        res.json({ success: true, message: "Telegram task submitted for admin review! It will be live after admin approval." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৬. অন্যান্য সাধারণ টাস্ক ক্রিয়েট করার API (ইউটিউব/ফেসবুক ইত্যাদি)
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
            ownerId: telegramId,
            completedCount: 0
        });

        await newTask.save();
        res.json({ success: true, message: "Task created successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৭. অ্যাডমিন প্যানেল: পেন্ডিং টেলিগ্রাম টাস্ক ক্রিয়েট রিকোয়েস্ট লিস্ট
app.get('/api/admin/pending-task-creations', async (req, res) => {
    try {
        const requests = await TaskCreationRequest.find({ status: 'pending' });
        res.json({ success: true, requests });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৮. অ্যাডমিন প্যানেল: পেন্ডিং টাস্ক কমপ্লিট প্রুফ লিস্ট
app.get('/api/admin/pending-proofs', async (req, res) => {
    try {
        const proofs = await TaskSubmissionProof.find({ status: 'pending' }).populate('taskId');
        res.json({ success: true, proofs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ৯. অ্যাডমিন প্যানেল: টেলিগ্রাম টাস্ক ক্রিয়েশন রিভিউ (Approve/Reject) ও ইমেজ অটো-ডিলিট (ডাটাবেজ মেমোরি সেভ করতে)
app.post('/api/admin/review-task-creation', async (req, res) => {
    try {
        const { submissionId, action } = req.body;
        const request = await TaskCreationRequest.findById(submissionId);
        
        if (!request) return res.status(404).json({ success: false, error: "Request not found" });

        if (action === 'approve') {
            const newTask = new Task({
                platform: request.taskData.platform,
                taskType: request.taskData.taskType,
                link: request.taskData.link,
                reward: request.taskData.reward,
                ownerId: request.userId,
                completedCount: 0
            });
            await newTask.save();
        }

        // 512 MB ফ্রি স্টোরেজ নিরাপদ রাখতে প্রসেস হওয়ার পর রিকোয়েস্ট বা ডাটাবেজ থেকে ছবি ডিলিট করা
        await TaskCreationRequest.findByIdAndDelete(submissionId);

        res.json({ success: true, message: `Task creation request ${action}ed successfully!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ১০. অ্যাডমিন প্যানেল: টাস্ক কমপ্লিট প্রুফ রিভিউ (Approve/Reject) ও পয়েন্ট যোগ করা এবং ইমেজ অটো-ডিলিট
app.post('/api/admin/review-submission', async (req, res) => {
    try {
        const { submissionId, action } = req.body;
        const proof = await TaskSubmissionProof.findById(submissionId).populate('taskId');
        
        if (!proof) return res.status(404).json({ success: false, error: "Proof not found" });

        if (action === 'approve' && proof.taskId) {
            const user = await User.findOne({ telegramId: proof.userId });
            const task = proof.taskId;
            const taskOwner = await User.findOne({ telegramId: task.ownerId });

            if (user && taskOwner && taskOwner.points >= task.reward) {
                taskOwner.points -= task.reward;
                await taskOwner.save();

                user.completedTasks.push(task._id);
                user.points += task.reward;
                await user.save();

                task.completedCount = (task.completedCount || 0) + 1;
                await task.save();
            }
        }

        // 512 MB ফ্রি স্টোরেজ নিরাপদ রাখতে প্রুফ ইমেজ ডাটাবেজ থেকে ডিলিট করা
        await TaskSubmissionProof.findByIdAndDelete(submissionId);

        res.json({ success: true, message: `Submission ${action}ed successfully!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ১১. সরাসরি ইউজারকে ক্রেডিট পাঠানোর API
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
        
        if (!targetUser) {
            return res.status(404).json({ success: false, error: "Target user not found in database!" });
        }

        targetUser.points += Number(amount);
        await targetUser.save();

        res.json({ success: true, newBalance: targetUser.points });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
