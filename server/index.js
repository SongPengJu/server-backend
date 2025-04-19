const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// MongoDB连接
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB连接成功');
}).catch(err => {
    console.error('MongoDB连接失败:', err);
});

// 照片模型
const Photo = mongoose.model('Photo', {
    title: String,
    description: String,
    date: Date,
    imageUrl: String
});

// CORS配置
const corsOptions = {
    origin: '*',  // 允许所有域名访问
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
    credentials: false
};

// 中间件
app.use(cors(corsOptions));
app.use(express.json());

// 确保上传目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    console.log('创建上传目录');
    fs.mkdirSync(uploadsDir);
}

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        console.log('文件上传目标目录:', uploadsDir);
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const filename = Date.now() + path.extname(file.originalname);
        console.log('生成的文件名:', filename);
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 限制5MB
    }
});

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
        console.log('收到新的照片上传请求');
        console.log('请求体:', req.body);
        console.log('上传的文件:', req.file);

        const { title, description, date } = req.body;
        const imageUrl = `/uploads/${req.file.filename}`;
        
        const newPhoto = new Photo({
            title,
            description,
            date: new Date(date),
            imageUrl
        });
        
        console.log('创建新照片对象:', newPhoto);
        
        await newPhoto.save();
        console.log('照片保存成功');
        
        res.json(newPhoto);
    } catch (error) {
        console.error('上传照片时发生错误:', error);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// 删除照片
app.delete('/api/photos/:id', async (req, res) => {
    try {
        console.log('收到删除照片请求，ID:', req.params.id);
        const id = req.params.id;
        
        const photo = await Photo.findById(id);
        if (!photo) {
            console.log('未找到要删除的照片');
            return res.status(404).json({ error: 'Photo not found' });
        }
        
        const imagePath = path.join(uploadsDir, path.basename(photo.imageUrl));
        
        console.log('准备删除文件:', imagePath);
        
        // 删除文件
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log('文件删除成功');
        } else {
            console.log('文件不存在，跳过删除');
        }
        
        // 从数据库中删除
        await Photo.findByIdAndDelete(id);
        console.log('照片数据已从数据库中删除');
        
        res.json({ message: 'Photo deleted successfully' });
    } catch (error) {
        console.error('删除照片时发生错误:', error);
        res.status(500).json({ error: 'Failed to delete photo' });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
    console.log(`服务器启动在端口 ${port}`);
    console.log('上传目录路径:', uploadsDir);
}); 
