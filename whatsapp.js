import { makeWASocket, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { extractTaskFromMessage } from './ai.js';

let currentQR = null;
let generatedTasks = []; // In-memory store for now

export function getQR() {
  return currentQR;
}

export function getTasks() {
  return generatedTasks;
}

import { useSupabaseAuthState } from './supabaseAuth.js';

export async function startWhatsAppClient() {
  const { state, saveCreds } = await useSupabaseAuthState();

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // We still print to terminal for convenience
    logger: pino({ level: 'silent' }), // Hide internal logs
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      currentQR = qr; // Save for the frontend
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
      currentQR = null;
      if (shouldReconnect) {
        startWhatsAppClient();
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp connected!');
      currentQR = null; // Clear QR code as we are connected
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      // Skip our own messages
      if (msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid; // The chat ID (user or group)
      const isGroup = remoteJid.endsWith('@g.us');
      const senderId = msg.key.participant || remoteJid; // Who sent it

      // Get text
      const text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   '';

      if (!text) continue;

      let shouldProcess = false;

      if (!isGroup) {
        // Direct message
        shouldProcess = true;
      } else {
        // Group message: check if we are mentioned or if there's an @everyone
        // ContextInfo contains mentionedJid array
        const contextInfo = msg.message.extendedTextMessage?.contextInfo;
        const mentionedJids = contextInfo?.mentionedJid || [];
        
        // My number is sock.user.id (e.g. 919876543210:1@s.whatsapp.net)
        // We strip the device string (:1) for comparison
        const myId = sock.user?.id.split(':')[0] + '@s.whatsapp.net';
        
        const mentionsMe = mentionedJids.includes(myId);
        const mentionsEveryone = text.includes('@everyone') || text.includes('@all');

        if (mentionsMe || mentionsEveryone) {
          shouldProcess = true;
        }
      }

      if (shouldProcess) {
        console.log(`\n💬 Received message to process from ${senderId}:\n"${text}"`);
        console.log('🧠 Sending to AI for triage...');
        
        const aiResponse = await extractTaskFromMessage(text, senderId);
        
        if (aiResponse && aiResponse.isTask) {
          console.log('🎯 AI identified a task:', aiResponse);
          
          // Build task object
          const newTask = {
            id: `wa-${Date.now()}`,
            title: aiResponse.title,
            description: aiResponse.description,
            priority: aiResponse.priority.toLowerCase(), // critical, high, medium, low
            urgency: aiResponse.urgency.toLowerCase(),   // today, this week
            source: 'whatsapp',
            status: 'open',
            createdAt: new Date().toISOString(),
            rawMessage: text,
            sender: senderId
          };

          generatedTasks.push(newTask);
          // Only keep last 50 tasks in memory to prevent bloat
          if (generatedTasks.length > 50) generatedTasks.shift();
        } else {
          console.log('⏭️ AI determined this is NOT a task. Ignored.');
        }
      }
    }
  });
}
