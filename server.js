// server.js

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const config = require('./config');
const initializeRoutes = require('./routes');

// Variável para armazenar a instância do cliente WhatsApp (sock)
let sock;

// --- Função principal para iniciar o cliente WhatsApp (Baileys) ---
async function startBaileys() {
  // Salva a autenticação em arquivos para não precisar escanear o QR code toda vez
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_session');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // Imprime o QR code diretamente no terminal
  });

  // Listener para eventos de conexão
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('--- PAINEL DE ADMIN: CONEXÃO WHATSAPP ---');
      console.log('Para conectar o serviço de notificações, escaneie o QR Code abaixo com o seu WhatsApp.');
      qrcode.generate(qr, { small: true });
      console.log('\n--- AVISO IMPORTANTE ---');
      console.log('=> Use um número de WhatsApp DESCARTÁVEL ou um número dedicado para a empresa.');
      console.log('=> NÃO USE seu número pessoal. O uso de automação pode levar ao banimento do número pelo WhatsApp.');
      console.log('=> Este número será usado para enviar mensagens automáticas sobre o status dos pedidos para os clientes.');
      console.log('-------------------------------------------');
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Motivo:', lastDisconnect.error, ', reconectando:', shouldReconnect);
      if (shouldReconnect) {
        startBaileys(); // Tenta reconectar
      } else {
        console.error('Não foi possível reconectar. Você foi desconectado. Apague a pasta "baileys_auth_session" e reinicie o servidor para gerar um novo QR Code.');
      }
    } else if (connection === 'open') {
      console.log('Conexão WhatsApp aberta e pronta para enviar mensagens!');
    }
  });

  // Listener para salvar as credenciais atualizadas
  sock.ev.on('creds.update', saveCreds);

  return sock;
}

// --- Função para configurar e iniciar o servidor Express ---
async function startServer() {
  const app = express();

  // 1. Middlewares
  app.use(cors(config.corsOptions)); // Aplica as opções de CORS
  app.use(express.json()); // Para parsear body de requisições JSON
  app.use(express.urlencoded({ extended: true }));

  // 2. Conexão com o Banco de Dados
  mongoose.connect(config.mongoURI)
    .then(() => console.log('Conectado ao MongoDB Atlas com sucesso.'))
    .catch((err) => console.error('Falha ao conectar ao MongoDB:', err));

  // 3. Inicializa o cliente WhatsApp
  // O servidor só deve começar a aceitar rotas que dependem do WhatsApp depois que o cliente estiver pronto.
  console.log('Iniciando cliente WhatsApp...');
  const waSock = await startBaileys();
  
  // 4. Rotas da API
  // Injeta a instância do socket (waSock) no inicializador de rotas
  const apiRoutes = initializeRoutes(waSock);
  app.use('/api', apiRoutes);
  
  // Rota raiz para health check
  app.get('/', (req, res) => {
    res.send('Servidor da Loja de Perfumes está no ar!');
  });

  // 5. Iniciar o servidor
  const PORT = config.port;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`API disponível em http://localhost:${PORT}`);
  });
}

// Inicia a aplicação
startServer();