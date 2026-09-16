const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const MONGO_URI = "mongodb+srv://torikul570:Nadira1432@cluster0.m5iatns.mongodb.net/?appName=Cluster0";
const BOT_TOKEN = "8801531798:AAEw7SJhnT1T8x69caPgMncjI6IPBAgWN3Q";
const ADMIN_TELEGRAM_ID = "8351272061";

// জেমিনি এআই ইনিশিয়ালাইজেশন
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'torikul570islam@gmail.com',
        pass: 'zkqrkaxycksuksbr'
    }
});

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

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
    ownerId: String,
    completedCount: { type: Number, default: 0 }
});
const Task = mongoose.model('Task', TaskSchema);

const TaskSubmissionProofSchema = new mongoose.Schema({
    userId: String,
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    proofUrl: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const TaskSubmissionProof = mongoose.model('TaskSubmissionProof', TaskSubmissionProofSchema);

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

app.post('/api/set-password', async (req, res) => {
    try {
        const { telegramId, password } = req.body;
        await User.findOneAndUpdate({ telegramId }, { password });
        res.json({ success: true, message: "Password set successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
            amount = 10;
            points = 100;
        } else if (packageType === 'medium') {
            title = "500 Points";
            description = "Get 500 points for Like4Like tasks";
            amount = 40;
            points = 500;
        } else if (packageType === 'large') {
            title = "1200 Points";
            description = "Get 1200 points for Like4Like tasks";
            amount = 99;
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
        res.status(500).json({ error: err.message });
    }
});

bot.on('pre_checkout_query', async (query) => {
    try {
        await bot.answerPreCheckoutQuery(query.id, true);
    } catch (err) {
        console.error(err);
    }
});

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
            if (!owner || owner.points < task.reward) continue;

            if (task.platform === 'telegram') {
                try {
                    let chatIdentifier = task.link.trim();
                    if (chatIdentifier.includes('t.me/')) {
                        chatIdentifier = '@' + chatIdentifier.split('t.me/')[1].split('/')[0];
                    }

                    const botInfo = await bot.getMe();
                    const chatMember = await bot.getChatMember(chatIdentifier, botInfo.id);
                    const adminStatuses = ['creator', 'administrator'];

                    if (!adminStatuses.includes(chatMember.status)) {
                        continue; 
                    }
                } catch (botErr) {
                    continue;
                }
            }

            validTasks.push(task);
        }

        res.json(validTasks.slice(0, 10));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/my-tasks/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        const tasks = await Task.find({ ownerId: telegramId });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks/delete/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        await Task.findByIdAndDelete(taskId);
        res.json({ success: true, message: "Task deleted successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

app.post('/api/tasks/verify-telegram', async (req, res) => {
    try {
        const { telegramId, taskId } = req.body;
        const user = await User.findOne({ telegramId });
        const task = await Task.findById(taskId);

        if (!user || !task) return res.status(404).json({ success: false, error: "Task or User not found" });

        if (user.completedTasks.includes(taskId)) {
            return res.status(400).json({ success: false, error: "Task already completed" });
        }

        let chatIdentifier = task.link.trim();
        if (chatIdentifier.includes('t.me/')) {
            chatIdentifier = '@' + chatIdentifier.split('t.me/')[1].split('/')[0];
        }

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

app.post('/api/tasks/submit-proof', async (req, res) => {
    try {
        const { telegramId, taskId, proofUrl } = req.body;
        if (!telegramId || !taskId || !proofUrl) {
            return res.status(400).json({ success: false, error: "All fields including screenshot proof are required!" });
        }

        const user = await User.findOne({ telegramId });
        const task = await Task.findById(taskId);

        if (!user || !task) {
            return res.status(404).json({ success: false, error: "User or Task not found" });
        }

        if (user.completedTasks.includes(taskId)) {
            return res.status(400).json({ success: false, error: "Task already completed" });
        }

        const taskType = task.taskType || 'general action';

        const aiPrompt = `You are a strict and highly accurate AI Task Verification Expert. Your job is to verify user-submitted proof screenshots for micro-job platforms.

        TASK TYPE: "${taskType}"

        EVALUATION INSTRUCTIONS:
        1. Analyze the uploaded screenshot with extreme care.
        2. Check if the visual evidence matches the specific task type ("${taskType}"):
           - If taskType involves "Telegram": Look for chat interface, channel join confirmation, or member status.
           - If taskType involves "YouTube Subscribe": Look for the "Subscribed" button, checkmark, or bell icon on a channel page.
           - If taskType involves "YouTube/Facebook/Instagram/TikTok Like": Look for a highlighted/filled like button, heart, or thumbs-up icon.
           - If taskType involves "Followers": Look for a "Following" or "Friends" state on the profile page.
        3. Be strict: If the screenshot is blurry, completely unrelated, shows a different app/page, or lacks proof, give a low confidence score (0-30). If it clearly matches, give a high confidence score (70-100).

        RESPONSE FORMAT:
        Reply strictly in valid JSON format ONLY, without any markdown formatting or extra text:
        {
          "confidence": <integer between 0 to 100>,
          "reason": "<A short explanation of what is visible in the screenshot and why it passes or fails>"
        }`;

        let confidenceScore = 0;
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [
                    {
                        inlineData: {
                            data: proofUrl.replace(/^data:image\/\w+;base64,/, ""),
                            mimeType: "image/jpeg"
                        }
                    },
                    {
                        text: aiPrompt
                    }
                ]
            });

            const rawText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
            const aiResult = JSON.parse(rawText);
            confidenceScore = aiResult.confidence || 0;
        } catch (aiErr) {
            console.error("AI Vision verification error:", aiErr);
            confidenceScore = 0; 
        }

        if (confidenceScore >= 40) {
            const taskOwner = await User.findOne({ telegramId: task.ownerId });
            if (!taskOwner || taskOwner.points < task.reward) {
                return res.status(400).json({ success: false, error: "Task owner has insufficient balance." });
            }

            taskOwner.points -= task.reward;
            await taskOwner.save();

            user.completedTasks.push(taskId);
            user.points += task.reward;
            await user.save();

            task.completedCount = (task.completedCount || 0) + 1;
            await task.save();

            return res.json({ 
                success: true, 
                autoApproved: true, 
                confidence: confidenceScore,
                message: `Task auto-approved by AI! +${task.reward} points added.` 
            });
        } else {
            const newProof = new TaskSubmissionProof({
                userId: telegramId,
                taskId,
                proofUrl,
                status: 'pending'
            });

            await newProof.save();
            return res.json({ 
                success: true, 
                autoApproved: false, 
                confidence: confidenceScore,
                message: "Confidence is below 40%. Sent to admin panel for manual review." 
            });
        }

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/tasks/create', async (req, res) => {
    try {
        const { telegramId, platform, taskType, link, reward } = req.body;
        
        if (Number(reward) < 5) {
            return res.status(400).json({ success: false, error: "Minimum reward must be at least 5 points!" });
        }

        const newTask = new Task({
            platform: platform || 'telegram',
            taskType,
            link,
            reward: Number(reward),
            ownerId: telegramId,
            completedCount: 0
        });

        await newTask.save();
        res.json({ success: true, message: "Task created and live successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/pending-proofs', async (req, res) => {
    try {
        const proofs = await TaskSubmissionProof.find({ status: 'pending' }).populate('taskId');
        res.json({ success: true, proofs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

        await TaskSubmissionProof.findByIdAndDelete(submissionId);

        res.json({ success: true, message: `Submission ${action}ed successfully!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
