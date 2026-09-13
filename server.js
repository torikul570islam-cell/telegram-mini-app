require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(cors());

// ১. MongoDB কানেকশন
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch((err) => console.error('❌ MongoDB Connection Error:', err));

// ২. টেলিগ্রাম বট ইনিশিয়ালাইজ (Polling দিয়ে)
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ৩. Nodemailer জিমেইল ট্রান্সপোর্টার সেটআপ
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ৪. উইথড্র রিকোয়েস্ট এপিআই (Gmail নোটিফিকেশন সহ)
app.post('/api/withdraw', async (req, res) => {
  const { userId, username, amount, walletAddress } = req.body;

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: `🚨 New Withdraw Request from @${username || 'User'}`,
      text: `User ID: ${userId}\nUsername: @${username}\nAmount: ${amount}\nWallet/Details: ${walletAddress}\n\nদয়া করে চেক করে পেমেন্ট কমপ্লিট করুন।`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "Withdraw request submitted successfully!" });
  } catch (error) {
    console.error("Withdraw Error:", error);
    res.status(500).json({ success: false, error: "Failed to process withdraw request." });
  }
});

// ৫. টেলিগ্রাম স্টারস (XTR) পেমেন্ট ইনভয়েস পাঠানোর রাউট
app.post('/api/send-invoice', async (req, res) => {
  const { chatId, title, description, payload, amount } = req.body;

  try {
    const prices = [{ label: 'Credits', amount: amount }];
    
    await bot.sendInvoice(
      chatId,
      title || 'Buy Credits',
      description || 'Purchase credits using Telegram Stars',
      payload || 'credits_payload',
      '',
      'XTR',
      prices
    );

    res.status(200).json({ success: true, message: "Invoice sent successfully!" });
  } catch (error) {
    console.error("Invoice Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ৬. পেমেন্টের আগের ভ্যালিডেশন (Pre-checkout query)
bot.on('pre_checkout_query', async (query) => {
  try {
    await bot.answerPreCheckoutQuery(query.id, true);
  } catch (error) {
    console.error("Pre-checkout Error:", error);
  }
});

// ৭. পেমেন্ট সফল হওয়ার পরের হ্যান্ডলার (`successful_payment`)
bot.on('message', async (msg) => {
  if (msg.successful_payment) {
    const payment = msg.successful_payment;
    const chatId = msg.chat.id;
    
    console.log("Payment Successful:", payment);
    await bot.sendMessage(chatId, `🎉 Payment of ${payment.total_amount} Stars successful! Credits added to your account.`);
  }
});

// সার্ভার স্টার্ট
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
