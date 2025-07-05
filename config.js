// config.js

// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

// Exporta um objeto com todas as configurações centralizadas
module.exports = {
  // Configurações do Servidor
  port: process.env.PORT || 5000,

  // Configurações do Banco de Dados MongoDB Atlas
  // Ex: mongodb+srv://user:password@cluster.mongodb.net/perfumeStore?retryWrites=true&w=majority
  mongoURI: process.env.MONGO_URI,

  // Configurações do Cloudinary para armazenamento de mídia
  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },

  // Configurações de Autenticação com JSON Web Token (JWT)
  jwtSecret: process.env.JWT_SECRET,

  // Configurações da API de Pagamento M-Pesa (Sandbox de Teste)
  mpesa: {
    // NOTA: O token 'Bearer' fornecido é de longa duração para o sandbox.
    // Em produção, você precisaria de um sistema para gerar tokens de curta duração.
    authToken: process.env.MPESA_AUTH_TOKEN,
    apiURL: process.env.MPESA_API_URL,
    serviceProviderCode: process.env.MPESA_SERVICE_PROVIDER_CODE, // O código do seu serviço/loja
  },

  // Configurações de CORS (Cross-Origin Resource Sharing)
  // Permitir requisições de qualquer origem, como solicitado.
  corsOptions: {
    origin: '*',
  }
};