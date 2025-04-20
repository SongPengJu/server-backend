const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
// 使用环境变量PORT，如果没有则使用3000
const port = process.env.PORT || 3000;

// 中间件
app.use(cors({
    origin: ['https://songpengju.github.io', 'http://localhost:8000'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());

// 日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// MongoDB连接
const connectWithRetry = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000
        });
        console.log('MongoDB连接成功');
    } catch (error) {
        console.error('MongoDB连接失败，5秒后重试:', error);
        setTimeout(connectWithRetry, 5000);
    }
};

connectWithRetry();

// 照片模型
const Photo = mongoose.model('Photo', {
    title: String,
    description: String,
    date: Date,
    imageUrl: String,
    cloudinaryId: String
});

// 信件模型
const Letter = mongoose.model('Letter', {
    title: String,
    content: String,
    date: { type: Date, default: Date.now },
    signature: String
});

// 确保上传目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    console.log('创建上传目录');
    fs.mkdirSync(uploadsDir);
}

// Cloudinary配置
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 配置Cloudinary存储
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'memory-photos',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
        transformation: [{ width: 1000, crop: 'limit' }]
    }
});

const upload = multer({ storage: storage });

// 静态文件服务
app.use('/uploads', express.static(uploadsDir));

// 健康检查端点
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// 获取所有照片
app.get('/api/photos', async (req, res) => {
    try {
        console.log('收到获取照片列表请求');
        const photos = await Photo.find().sort({ date: -1 });
        console.log('返回照片数量:', photos.length);
        res.json(photos);
    } catch (error) {
        console.error('获取照片列表失败:', error);
        res.status(500).json({ error: 'Failed to fetch photos' });
    }
});

// 上传新照片
app.post('/api/photos', upload.single('image'), async (req, res) => {
    try {
        console.log('收到照片上传请求');
        console.log('请求体:', req.body);
        console.log('文件:', req.file);

        if (!req.file) {
            return res.status(400).json({ error: '请上传图片' });
        }

        const photo = new Photo({
            title: req.body.title,
            description: req.body.description,
            date: req.body.date,
            imageUrl: req.file.path, // Cloudinary返回的URL
            cloudinaryId: req.file.filename // Cloudinary的公共ID
        });

        await photo.save();
        console.log('照片保存成功:', photo);
        res.status(201).json(photo);
    } catch (error) {
        console.error('保存照片失败:', error);
        res.status(500).json({ error: '保存照片失败' });
    }
});

// 删除照片
app.delete('/api/photos/:id', async (req, res) => {
    try {
        const photo = await Photo.findById(req.params.id);
        if (!photo) {
            return res.status(404).json({ error: '照片不存在' });
        }

        // 从Cloudinary删除图片
        await cloudinary.uploader.destroy(photo.cloudinaryId);
        
        // 从数据库删除记录
        await Photo.findByIdAndDelete(req.params.id);
        
        res.status(200).json({ message: '照片删除成功' });
    } catch (error) {
        console.error('删除照片失败:', error);
        res.status(500).json({ error: '删除照片失败' });
    }
});

// 获取所有信件
app.get('/api/letters', async (req, res) => {
    try {
        console.log('收到获取信件列表请求');
        const letters = await Letter.find().sort({ date: -1 });
        console.log('返回信件数量:', letters.length);
        
        // 如果没有信件，创建一个默认信件
        if (letters.length === 0) {
            console.log('没有找到信件，创建默认信件');
            const defaultLetter = new Letter({
                title: '欢迎使用',
                content: '这是一个新的开始...',
                signature: '永远的朋友'
            });
            await defaultLetter.save();
            letters.push(defaultLetter);
            console.log('默认信件创建成功');
        }
        
        res.json(letters);
    } catch (error) {
        console.error('获取信件列表失败:', error);
        res.status(500).json({ error: 'Failed to fetch letters' });
    }
});

// 获取单个信件
app.get('/api/letters/:id', async (req, res) => {
    try {
        console.log('收到获取信件请求，ID:', req.params.id);
        
        // 如果是请求默认信件
        if (req.params.id === 'default') {
            console.log('请求默认信件');
            let defaultLetter = await Letter.findOne({ title: '欢迎使用' });
            
            if (!defaultLetter) {
                console.log('创建默认信件');
                defaultLetter = new Letter({
                    title: '欢迎使用',
                    content: '这是一个新的开始...',
                    signature: '永远的朋友'
                });
                await defaultLetter.save();
                console.log('默认信件创建成功');
            }
            
            return res.json(defaultLetter);
        }
        
        const letter = await Letter.findById(req.params.id);
        if (!letter) {
            return res.status(404).json({ error: 'Letter not found' });
        }
        res.json(letter);
    } catch (error) {
        console.error('获取信件失败:', error);
        res.status(500).json({ error: 'Failed to fetch letter' });
    }
});

// 创建新信件
app.post('/api/letters', async (req, res) => {
    try {
        console.log('收到创建信件请求');
        const { title, content, signature } = req.body;
        
        const newLetter = new Letter({
            title,
            content,
            signature: signature || '永远的朋友'
        });
        
        await newLetter.save();
        console.log('信件保存成功');
        res.json(newLetter);
    } catch (error) {
        console.error('创建信件失败:', error);
        res.status(500).json({ error: 'Failed to create letter' });
    }
});

// 更新信件
app.put('/api/letters/:id', async (req, res) => {
    try {
        console.log('收到更新信件请求，ID:', req.params.id);
        console.log('请求体:', req.body);
        
        const { title, content, signature } = req.body;
        
        if (!title || !content) {
            console.error('缺少必要字段');
            return res.status(400).json({ 
                error: 'Bad Request',
                message: '标题和内容不能为空'
            });
        }
        
        const letter = await Letter.findByIdAndUpdate(
            req.params.id,
            { 
                title,
                content,
                signature: signature || '永远的朋友',
                date: new Date() // 更新修改时间
            },
            { 
                new: true,
                runValidators: true
            }
        );
        
        if (!letter) {
            console.error('未找到要更新的信件');
            return res.status(404).json({ 
                error: 'Not Found',
                message: '信件不存在'
            });
        }
        
        console.log('信件更新成功:', letter);
        res.json(letter);
    } catch (error) {
        console.error('更新信件失败:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// 删除信件
app.delete('/api/letters/:id', async (req, res) => {
    try {
        console.log('收到删除信件请求，ID:', req.params.id);
        const letter = await Letter.findByIdAndDelete(req.params.id);
        
        if (!letter) {
            return res.status(404).json({ error: 'Letter not found' });
        }
        
        console.log('信件删除成功');
        res.json({ message: 'Letter deleted successfully' });
    } catch (error) {
        console.error('删除信件失败:', error);
        res.status(500).json({ error: 'Failed to delete letter' });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器启动在端口 ${port}`);
    console.log('上传目录路径:', uploadsDir);
    console.log('MongoDB URI:', process.env.MONGODB_URI);
    console.log('环境变量:', {
        PORT: process.env.PORT,
        MONGODB_URI: process.env.MONGODB_URI,
        UPLOAD_DIR: process.env.UPLOAD_DIR
    });
}); 
