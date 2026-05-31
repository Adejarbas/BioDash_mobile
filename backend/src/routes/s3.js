const express = require('express');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// O S3Client usa automaticamente as credenciais da IAM Instance Role da EC2.
// Nenhuma Access Key precisa ser configurada no código ou no .env.
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  requestChecksumCalculation: 'WHEN_REQUIRED'
});

const BUCKET = process.env.S3_BUCKET_NAME || 'biogen-s3';

// ==========================================
// POST /api/s3/upload-url
// Gera uma URL pré-assinada para o frontend
// fazer upload direto ao S3 sem expor credenciais
// ==========================================
router.post('/upload-url', authMiddleware, async (req, res) => {
  try {
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({
        success: false,
        message: 'fileName e contentType são obrigatórios.',
      });
    }

    // Prefixo de segurança: cada usuário sobe na sua própria pasta
    const key = `avatars/${req.user.id}/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    // URL válida por 5 minutos para o upload
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    res.json({
      success: true,
      data: {
        uploadUrl: signedUrl,
        key,
        publicUrl: `https://${BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`,
      },
    });
  } catch (err) {
    console.error('Erro ao gerar URL de upload S3:', err);
    res.status(500).json({ success: false, message: 'Erro ao gerar URL de upload.' });
  }
});

// ==========================================
// GET /api/s3/download-url?key=avatars/...
// Gera uma URL pré-assinada para download/visualização
// ==========================================
router.get('/download-url', authMiddleware, async (req, res) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ success: false, message: 'key é obrigatório.' });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    // URL válida por 1 hora para leitura
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    res.json({ success: true, data: { downloadUrl: signedUrl } });
  } catch (err) {
    console.error('Erro ao gerar URL de download S3:', err);
    res.status(500).json({ success: false, message: 'Erro ao gerar URL de download.' });
  }
});

module.exports = router;
