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
// A função agora aceita o objeto de estado da conexão para poder atualizá-lo
async function startBaileys(connectionState) {
  // Salva a autenticação em arquivos para não precisar escanear o QR code toda vez
  const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_session');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // Mantém a impressão no terminal para debug
  });

  // Listener para eventos de conexão que atualiza o objeto de estado global
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Atualiza o objeto de estado que será exposto pela API
    if (qr) {
      console.log('--- PAINEL DE ADMIN: CONEXÃO WHATSAPP ---');
      console.log('Um QR Code foi gerado. Escaneie-o no painel admin ou aqui no terminal.');
      // Mostra o QR code no terminal como fallback
      qrcode.generate(qr, { small: true }); 
      connectionState.qr = qr;
      connectionState.status = 'qr';
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`Conexão fechada. Motivo: ${statusCode}, reconectando: ${shouldReconnect}`);
      connectionState.status = 'disconnected';

      if (shouldReconnect) {
        // Tenta reconectar passando o mesmo objeto de estado
        startBaileys(connectionState); 
      } else {
        connectionState.status = 'logged_out';
        console.error('Não foi possível reconectar. Você foi desconectado (logged out). Apague a pasta "baileys_auth_session" e reinicie o servidor para gerar um novo QR Code.');
      }
    } else if (connection === 'open') {
      console.log('Conexão WhatsApp aberta e pronta para enviar mensagens!');
      connectionState.status = 'connected';
      connectionState.qr = null; // Limpa o QR code, pois não é mais necessário
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

  // 3. Objeto de estado da conexão do WhatsApp e inicialização do Baileys
  // Este objeto será compartilhado com o Baileys e o novo endpoint de API.
  let waConnectionState = { status: 'initializing', qr: null };
  
  console.log('Iniciando cliente WhatsApp...');
  // Passa o objeto de estado para a função startBaileys
  const waSock = await startBaileys(waConnectionState);
  
  // 4. Rotas da API
  // Injeta a instância do socket (waSock) no inicializador de rotas
  const apiRoutes = initializeRoutes(waSock);
  app.use('/api', apiRoutes);
  
  // 5. NOVO ENDPOINT DE STATUS DO WHATSAPP
  // Este endpoint permite que o frontend consulte o estado atual da conexão.
  app.get('/api/admin/whatsapp/status', (req, res) => {
      res.json(waConnectionState);
  });
  
  // Rota raiz para health check
  app.get('/', (req, res) => {
    res.send('Servidor da Loja de Perfumes está no ar!');
  });

  // 6. Iniciar o servidor
  const PORT = config.port;
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`API disponível em http://localhost:${PORT}`);
  });
}

// Inicia a aplicação
startServer();