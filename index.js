const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    downloadMediaMessage,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n📱 Scan this QR code with WhatsApp:\n');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ Bot connected!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];


        const messageText = msg.message?.conversation || 
                           msg.message?.extendedTextMessage?.text || 
                           msg.message?.imageMessage?.caption || '';
        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const senderName = msg.pushName || 'User';

        console.log(`📩 ${senderName}: ${messageText}`);

        const cmd = messageText.toLowerCase().trim();
        const args = messageText.split(' ');
        const command = args[0].toLowerCase();

        // ==================== MENU COMMAND ====================
        if (cmd === '.menu' || cmd === '.help') {
            const menuText = `╔══════════════════════════════════════╗
║     🤖 *ULTIMATE WHATSAPP BOT*       ║
╚══════════════════════════════════════╝

*📋 BASIC*
├─ hi/hello - Greet bot
├─ ping - Check speed
├─ menu/help - Show this menu
└─ read - Mark as read

*🎬 MEDIA*
├─ image - Random image
├─ video - Send video
├─ audio - Voice note
├─ file - Send document
├─ sticker - Send sticker
├─ location - Send location
└─ contact - Send contact

*🎛️ INTERACTIVE*
├─ buttons - Button options
├─ poll - Create poll
└─ list - List menu

*📢 BROADCAST*
├─ broadcast [msg] - Text to all
└─ bcmedia [caption] - Image to all

*📱 STATUS/STORIES*
├─ status - Post text status
├─ statusimage - Post image status
├─ statusvideo - Post video status
└─ getstatus - View statuses

*👥 GROUP MANAGEMENT*
├─ creategroup [name] - Create group
├─ groups - List your groups
├─ groupinfo - Group details
├─ participants - Member list
├─ grouplink - Get invite link
├─ revokelink - Revoke link
├─ joingroup [link] - Join group
├─ leave - Exit group
├─ add [number] - Add member
├─ kick [number] - Remove member
├─ promote [number] - Make admin
├─ demote [number] - Remove admin
├─ tagall - Mention everyone
├─ tagadmins - Mention admins
├─ setname [name] - Change name
├─ setdesc [text] - Change desc
├─ closegroup - Admins only msg
├─ opengroup - Everyone can msg
├─ lockedit - Lock group info
└─ unlockedit - Unlock group info

*👤 PROFILE*
├─ getpp - Get profile pic
├─ block [number] - Block user
└─ unblock [number] - Unblock user

*⚡ ACTIONS*
├─ react - React to msg
├─ typing - Show typing
├─ recording - Show recording
├─ delete - Delete msg
└─ download - Download media`;
            await sock.sendMessage(sender, { text: menuText });
        }

        // ==================== BASIC ====================
        else if (cmd === '.hi' || cmd === '.hello') {
            await sock.sendMessage(sender, { text: `Hello ${senderName}! 👋` });
        }
        else if (cmd === '.ping') {
            const start = Date.now();
            await sock.sendMessage(sender, { text: 'Pong!' });
            const end = Date.now();
            await sock.sendMessage(sender, { text: `Speed: ${end - start}ms` });
        }
        else if (cmd === '.read') {
            await sock.readMessages([msg.key]);
            await sock.sendMessage(sender, { text: '✓ Marked as read' });
        }

        // ==================== MEDIA ====================
        else if (cmd === '.image') {
            await sock.sendMessage(sender, {
                image: { url: 'https://picsum.photos/400/400' },
                caption: 'Random image! 📸'
            });
        }
        else if (cmd === '.video') {
            await sock.sendMessage(sender, {
                video: fs.readFileSync('./video.mp4'),
                caption: 'Video! 🎥',
                gifPlayback: true
            });
        }
        else if (cmd === '.audio') {
            await sock.sendMessage(sender, {
                audio: { url: './audio.mp3' },
                mimetype: 'audio/mp4',
                ptt: true
            });
        }
        else if (cmd === '.file') {
            await sock.sendMessage(sender, {
                document: fs.readFileSync('./document.pdf'),
                fileName: 'document.pdf',
                mimetype: 'application/pdf',
                caption: 'File! 📄'
            });
        }
        else if (cmd === '.sticker') {
            await sock.sendMessage(sender, {
                sticker: fs.readFileSync('./sticker.webp')
            });
        }
        else if (cmd === '.location') {
            await sock.sendMessage(sender, {
                location: {
                    degreesLatitude: 40.7128,
                    degreesLongitude: -74.0060,
                    name: 'New York City',
                    address: 'USA'
                }
            });
        }
        else if (cmd === '.contact') {
            await sock.sendMessage(sender, {
                contacts: {
                    displayName: 'John Doe',
                    contacts: [{ vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nTEL;type=CELL;type=VOICE;waid=1234567890:+1 234 567 890\nEND:VCARD' }]
                }
            });
        }

        // ==================== INTERACTIVE ====================
        else if (cmd === '.buttons') {
            await sock.sendMessage(sender, {
                text: 'Choose:',
                footer: 'Bot',
                buttons: [
                    { buttonId: '1', buttonText: { displayText: 'Option 1' }, type: 1 },
                    { buttonId: '2', buttonText: { displayText: 'Option 2' }, type: 1 }
                ],
                headerType: 1
            });
        }
        else if (cmd === '.poll') {
            await sock.sendMessage(sender, {
                poll: {
                    name: 'Favorite color?',
                    values: ['Red', 'Blue', 'Green', 'Yellow'],
                    selectableCount: 1
                }
            });
        }
        else if (cmd === '.list') {
            await sock.sendMessage(sender, {
                text: 'Select:',
                footer: 'Tap to open',
                title: 'Menu',
                buttonText: 'Options',
                sections: [{
                    title: 'Items',
                    rows: [
                        { title: 'Item 1', rowId: '1', description: 'Description 1' },
                        { title: 'Item 2', rowId: '2', description: 'Description 2' }
                    ]
                }]
            });
        }

        // ==================== BROADCAST ====================
        else if (command === '.broadcast' && args.length > 1) {
            const message = args.slice(1).join(' ');
            const chats = await sock.groupFetchAllParticipating();
            const contacts = Object.keys(chats).filter(id => id.endsWith('@s.whatsapp.net'));
            
            await sock.sendMessage(sender, { text: `Broadcasting...` });
            
            for (const contact of contacts) {
                await new Promise(r => setTimeout(r, 1000));
                await sock.sendMessage(contact, { text: `*Broadcast:*\n\n${message}` });
            }
            await sock.sendMessage(sender, { text: '✅ Broadcast sent!' });
        }
        else if (command === '.bcmedia' && args.length > 1) {
            const caption = args.slice(1).join(' ');
            const chats = await sock.groupFetchAllParticipating();
            const contacts = Object.keys(chats).filter(id => id.endsWith('@s.whatsapp.net'));
            
            for (const contact of contacts) {
                await new Promise(r => setTimeout(r, 1000));
                await sock.sendMessage(contact, {
                    image: { url: 'https://picsum.photos/400/400' },
                    caption: caption
                });
            }
            await sock.sendMessage(sender, { text: '✅ Media broadcast sent!' });
        }

        // ==================== STATUS/STORIES ====================
        else if (cmd === '.status') {
            await sock.sendMessage('status@broadcast', { text: 'My status update! 🎉' });
            await sock.sendMessage(sender, { text: '✅ Text status posted!' });
        }
        else if (cmd === '.statusimage') {
            await sock.sendMessage('status@broadcast', {
                image: { url: 'https://picsum.photos/400/400' },
                caption: 'Image status! 📸'
            });
            await sock.sendMessage(sender, { text: '✅ Image status posted!' });
        }
        else if (cmd === '.statusvideo') {
            await sock.sendMessage('status@broadcast', {
                video: fs.readFileSync('./video.mp4'),
                caption: 'Video status! 🎥'
            });
            await sock.sendMessage(sender, { text: '✅ Video status posted!' });
        }
        else if (cmd === '.getstatus') {
            await sock.sendMessage(sender, { text: 'Check status updates in your WhatsApp status tab!' });
        }

        // ==================== GROUP MANAGEMENT ====================
        else if (command === '.creategroup' && args.length > 1) {
    const groupName = args.slice(1).join(' ');
    try {
        // Try creating with just yourself first
        const group = await sock.groupCreate(groupName, [sock.user.id]);
        await sock.sendMessage(sender, { 
            text: `✅ Group "${groupName}" created!\nID: ${group.id}\n\nNow you can add members manually or use !add [number]` 
        });
    } catch (err) {
        console.log('Group creation error:', err);
        await sock.sendMessage(sender, { 
            text: `❌ Could not create group.\n\n*Workaround:*\n1. Create group manually in WhatsApp\n2. Add this bot number to the group\n3. Use !promote [bot-number] to make bot admin` 
        });
    }
}
        else if (cmd === '.groups') {
            const groups = await sock.groupFetchAllParticipating();
            const groupList = Object.values(groups).map(g => `• ${g.subject} (${g.participants.length} members)`).join('\n');
            await sock.sendMessage(sender, { text: `*Your Groups:*\n\n${groupList}` });
        }
        else if (cmd === '.groupinfo' && isGroup) {
            const metadata = await sock.groupMetadata(sender);
            const admins = metadata.participants.filter(p => p.admin).length;
            await sock.sendMessage(sender, {
                text: `*Name:* ${metadata.subject}\n*Members:* ${metadata.participants.length}\n*Admins:* ${admins}\n*Created:* ${new Date(metadata.creation * 1000).toLocaleDateString()}`
            });
        }
        else if (cmd === '.participants' && isGroup) {
            const metadata = await sock.groupMetadata(sender);
            let text = `*Members (${metadata.participants.length}):*\n\n`;
            metadata.participants.forEach(p => {
                const role = p.admin ? (p.admin === 'superadmin' ? '👑' : '⭐') : '👤';
                text += `${role} @${p.id.split('@')[0]}\n`;
            });
            await sock.sendMessage(sender, { text });
        }
        else if (cmd === '.grouplink' && isGroup) {
            const code = await sock.groupInviteCode(sender);
            await sock.sendMessage(sender, { text: `🔗 https://chat.whatsapp.com/${code}` });
        }
        else if (cmd === '.revokelink' && isGroup) {
            await sock.groupRevokeInvite(sender);
            await sock.sendMessage(sender, { text: '🔗 Link revoked! Use grouplink for new one.' });
        }
        else if (command === '.joingroup' && args.length > 1) {
            const link = args[1];
            const code = link.split('https://chat.whatsapp.com/')[1];
            await sock.groupAcceptInvite(code);
            await sock.sendMessage(sender, { text: '✅ Joined group!' });
        }
        else if (cmd === '.leave' && isGroup) {
            await sock.sendMessage(sender, { text: '👋 Goodbye!' });
            await sock.groupLeave(sender);
        }
        else if (command === '.add' && isGroup && args.length > 1) {
            const number = args[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await sock.groupParticipantsUpdate(sender, [number], 'add');
            await sock.sendMessage(sender, { text: `✅ Added ${args[1]}` });
        }
        else if (command === '.kick' && isGroup && args.length > 1) {
            const number = args[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await sock.groupParticipantsUpdate(sender, [number], 'remove');
            await sock.sendMessage(sender, { text: `🚫 Removed ${args[1]}` });
        }
        else if (command === '.promote' && isGroup && args.length > 1) {
            const number = args[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await sock.groupParticipantsUpdate(sender, [number], 'promote');
            await sock.sendMessage(sender, { text: `⬆️ Promoted ${args[1]}` });
        }
        else if (command === '.demote' && isGroup && args.length > 1) {
            const number = args[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await sock.groupParticipantsUpdate(sender, [number], 'demote');
            await sock.sendMessage(sender, { text: `⬇️ Demoted ${args[1]}` });
        }
        else if (cmd === '.tagall' && isGroup) {
            const metadata = await sock.groupMetadata(sender);
            const mentions = metadata.participants.map(p => p.id);
            let text = '*📢 Everyone!*\n\n';
            metadata.participants.forEach(p => {
                text += `@${p.id.split('@')[0]}\n`;
            });
            await sock.sendMessage(sender, { text, mentions });
        }
        else if (cmd === '.tagadmins' && isGroup) {
            const metadata = await sock.groupMetadata(sender);
            const admins = metadata.participants.filter(p => p.admin);
            const mentions = admins.map(p => p.id);
            let text = '*📢 Admins!*\n\n';
            admins.forEach(p => {
                text += `@${p.id.split('@')[0]}\n`;
            });
            await sock.sendMessage(sender, { text, mentions });
        }
        else if (command === '.setname' && isGroup && args.length > 1) {
            const name = args.slice(1).join(' ');
            await sock.groupUpdateSubject(sender, name);
            await sock.sendMessage(sender, { text: `✅ Name changed to: ${name}` });
        }
        else if (command === '.setdesc' && isGroup && args.length > 1) {
            const desc = args.slice(1).join(' ');
            await sock.groupUpdateDescription(sender, desc);
            await sock.sendMessage(sender, { text: `✅ Description updated!` });
        }
        else if (cmd === '.closegroup' && isGroup) {
            await sock.groupSettingUpdate(sender, 'announcement');
            await sock.sendMessage(sender, { text: '🔒 Group closed! Only admins can message.' });
        }
        else if (cmd === '.opengroup' && isGroup) {
            await sock.groupSettingUpdate(sender, 'not_announcement');
            await sock.sendMessage(sender, { text: '🔓 Group opened! Everyone can message.' });
        }
        else if (cmd === '.lockedit' && isGroup) {
            await sock.groupSettingUpdate(sender, 'locked');
            await sock.sendMessage(sender, { text: '🔒 Only admins can edit group info.' });
        }
        else if (cmd === '.unlockedit' && isGroup) {
            await sock.groupSettingUpdate(sender, 'unlocked');
            await sock.sendMessage(sender, { text: '🔓 Everyone can edit group info.' });
        }

        // ==================== PROFILE ====================
        else if (cmd === '.getpp') {
            try {
                const ppUrl = await sock.profilePictureUrl(sender, 'image');
                await sock.sendMessage(sender, { image: { url: ppUrl }, caption: 'Profile pic!' });
            } catch {
                await sock.sendMessage(sender, { text: 'No profile picture!' });
            }
        }
        else if (command === '.block' && args.length > 1) {
            const number = args[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await sock.updateBlockStatus(number, 'block');
            await sock.sendMessage(sender, { text: `🚫 Blocked ${args[1]}` });
        }
        else if (command === '.unblock' && args.length > 1) {
            const number = args[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            await sock.updateBlockStatus(number, 'unblock');
            await sock.sendMessage(sender, { text: `✅ Unblocked ${args[1]}` });
        }

        // ==================== ACTIONS ====================
        else if (cmd === '.react') {
            await sock.sendMessage(sender, { react: { text: '❤️', key: msg.key } });
        }
        else if (cmd === '.typing') {
            await sock.presenceSubscribe(sender);
            await sock.sendPresenceUpdate('composing', sender);
            setTimeout(() => sock.sendPresenceUpdate('paused', sender), 3000);
        }
        else if (cmd === '.recording') {
            await sock.presenceSubscribe(sender);
            await sock.sendPresenceUpdate('recording', sender);
            setTimeout(() => sock.sendPresenceUpdate('paused', sender), 3000);
        }
        else if (cmd === '.delete') {
            if (msg.message?.extendedTextMessage?.contextInfo?.stanzaId) {
                await sock.sendMessage(sender, { delete: {
                    remoteJid: sender,
                    fromMe: false,
                    id: msg.message.extendedTextMessage.contextInfo.stanzaId,
                    participant: msg.message.extendedTextMessage.contextInfo.participant
                }});
            }
        }
        else if (cmd === '.download') {
            if (msg.message?.imageMessage || msg.message?.videoMessage) {
                const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                const ext = msg.message.imageMessage ? 'jpg' : 'mp4';
                fs.writeFileSync(`./downloaded.${ext}`, buffer);
                await sock.sendMessage(sender, { text: `Saved as downloaded.${ext}` });
            }
        }

        // ==================== NO DEFAULT - IGNORE UNKNOWN MESSAGES ====================
        // Unknown messages are silently ignored - no reply sent
    });
}

connectToWhatsApp();
