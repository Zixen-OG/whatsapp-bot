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

// Owner number - change this to your number (with country code, no +)
const OWNER_NUMBER = '2348067298104'; 

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
        if (!msg || !msg.message) return;
        if (msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const senderName = msg.pushName || 'User';
        const isGroup = sender.endsWith('@g.us');

        let messageText = '';
        if (msg.message.conversation) {
            messageText = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
            messageText = msg.message.extendedTextMessage.text;
        } else if (msg.message.imageMessage?.caption) {
            messageText = msg.message.imageMessage.caption;
        } else if (msg.message.videoMessage?.caption) {
            messageText = msg.message.videoMessage.caption;
        }

        const cmd = messageText.toLowerCase().trim();
        const args = messageText.split(' ');
        const command = args[0].toLowerCase();

        // ==================== MENU ====================
        if (cmd === '.menu' || cmd === '.help') {
            const menuText = `╔══════════════════════════════════════╗
║     🤖 *ZIXEN WHATSAPP BOT*       ║
╚══════════════════════════════════════╝

*📋 BASIC*
.hi, .ping, .menu, .read

*🎬 MEDIA*
.image, .video, .audio, .file, .location, .contact

*🎛️ INTERACTIVE*
.buttons, .poll, .list

*📢 BROADCAST*
.broadcast [msg], .bcmedia [caption]

*📱 STATUS*
.status, .statusimage, .statusvideo

*👥 GROUP*
.creategroup [name], .groups, .groupinfo, .participants
.grouplink, .revokelink, .joingroup [link], .leave
.add [num], .kick [num], .promote [num], .demote [num]
.tagall, .tagadmins, .setname [name], .setdesc [text]
.closegroup, .opengroup, .lockedit, .unlockedit

*🔓 SPECIAL*
.vv - Unlock view once (reply to view once)
.sticker - Image to sticker (reply to image)
.save - Save anything (reply to any media/status)
.clear - Clear entire chat

*📊 INFO*
.owner, .runtime, .speed

*⚡ ACTIONS*
.react, .typing, .recording, .delete, .download`;
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
        else if (cmd === '.owner') {
            await sock.sendMessage(sender, { text: `👑 Bot Owner: @${OWNER_NUMBER}`, mentions: [OWNER_NUMBER + '@s.whatsapp.net'] });
        }
        else if (cmd === '.runtime') {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            await sock.sendMessage(sender, { text: `⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s` });
        }
        else if (cmd === '.speed') {
            const start = Date.now();
            await sock.sendMessage(sender, { text: '🏃‍♂️ Testing...' });
            const end = Date.now();
            await sock.sendMessage(sender, { text: `⚡ Speed: ${end - start}ms` });
        }

        // ==================== VIEW ONCE UNLOCKER (.vv) ====================
        else if (cmd === '.vv') {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            if (!quotedMsg) {
                await sock.sendMessage(sender, { text: '❌ Reply to a view once message with .vv to unlock it!' });
                return;
            }
            
            const isQuotedViewOnce = quotedMsg.viewOnceMessage?.message?.imageMessage || 
                                    quotedMsg.viewOnceMessage?.message?.videoMessage;
            
            if (!isQuotedViewOnce) {
                await sock.sendMessage(sender, { text: '❌ The quoted message is not a view once message!' });
                return;
            }
            
            try {
                const viewOnceContent = quotedMsg.viewOnceMessage.message;
                const isImage = viewOnceContent.imageMessage;
                const mediaType = isImage ? 'image' : 'video';
                const mediaMsg = isImage ? viewOnceContent.imageMessage : viewOnceContent.videoMessage;
                
                const buffer = await downloadMediaMessage(
                    { message: { [`${mediaType}Message`]: mediaMsg }, key: msg.key }, 
                    'buffer', 
                    {}, 
                    { logger: pino({ level: 'silent' }) }
                );
                
                const ownerJid = OWNER_NUMBER + '@s.whatsapp.net';
                
                const caption = `🔓 *VIEW ONCE UNLOCKED*\n\n` +
                               `*From:* ${senderName}\n` +
                               `*Chat:* ${isGroup ? 'Group' : 'Private'}\n` +
                               `*Time:* ${new Date().toLocaleString()}`;
                
                if (mediaType === 'image') {
                    await sock.sendMessage(ownerJid, {
                        image: buffer,
                        caption: caption
                    });
                } else {
                    await sock.sendMessage(ownerJid, {
                        video: buffer,
                        caption: caption
                    });
                }
                
                await sock.sendMessage(sender, { text: '✅ Unlocked and sent to your DM!' });
                
            } catch (err) {
                console.log('Error unlocking view once:', err);
                await sock.sendMessage(sender, { text: '❌ Failed to unlock. Try again!' });
            }
        }

        // ==================== STICKER CONVERTER (.sticker) ====================
        else if (cmd === '.sticker') {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            if (!quotedMsg) {
                await sock.sendMessage(sender, { text: '❌ Reply to an image with .sticker to convert it!' });
                return;
            }
            
            const isImage = quotedMsg.imageMessage;
            
            if (!isImage) {
                await sock.sendMessage(sender, { text: '❌ The quoted message is not an image!' });
                return;
            }
            
            try {
                const buffer = await downloadMediaMessage(
                    { message: { imageMessage: quotedMsg.imageMessage }, key: msg.key }, 
                    'buffer', 
                    {}, 
                    { logger: pino({ level: 'silent' }) }
                );
                
                await sock.sendMessage(sender, {
                    sticker: buffer
                });
                
                await sock.sendMessage(sender, { text: '✅ Sticker created!' });
                
            } catch (err) {
                console.log('Error creating sticker:', err);
                await sock.sendMessage(sender, { text: '❌ Failed to create sticker. Try again!' });
            }
        }

        // ==================== SAVE ANYTHING (.save) ====================
        else if (cmd === '.save') {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            if (!quotedMsg) {
                await sock.sendMessage(sender, { text: '❌ Reply to any message (image, video, audio, status, doc) with .save to save it!' });
                return;
            }
            
            try {
                const ownerJid = OWNER_NUMBER + '@s.whatsapp.net';
                let saved = false;
                let mediaType = '';
                let buffer = null;
                let caption = '';
                let originalCaption = '';
                
                // Check for status message (story)
                if (quotedMsg.statusMessage) {
                    const statusMsg = quotedMsg.statusMessage;
                    if (statusMsg.imageMessage) {
                        buffer = await downloadMediaMessage(
                            { message: { imageMessage: statusMsg.imageMessage }, key: msg.key },
                            'buffer', {}, { logger: pino({ level: 'silent' }) }
                        );
                        mediaType = 'image';
                        originalCaption = statusMsg.imageMessage.caption || '';
                        saved = true;
                    } else if (statusMsg.videoMessage) {
                        buffer = await downloadMediaMessage(
                            { message: { videoMessage: statusMsg.videoMessage }, key: msg.key },
                            'buffer', {}, { logger: pino({ level: 'silent' }) }
                        );
                        mediaType = 'video';
                        originalCaption = statusMsg.videoMessage.caption || '';
                        saved = true;
                    }
                }
                // Check for image
                else if (quotedMsg.imageMessage) {
                    buffer = await downloadMediaMessage(
                        { message: { imageMessage: quotedMsg.imageMessage }, key: msg.key },
                        'buffer', {}, { logger: pino({ level: 'silent' }) }
                    );
                    mediaType = 'image';
                    originalCaption = quotedMsg.imageMessage.caption || '';
                    saved = true;
                }
                // Check for video
                else if (quotedMsg.videoMessage) {
                    buffer = await downloadMediaMessage(
                        { message: { videoMessage: quotedMsg.videoMessage }, key: msg.key },
                        'buffer', {}, { logger: pino({ level: 'silent' }) }
                    );
                    mediaType = 'video';
                    originalCaption = quotedMsg.videoMessage.caption || '';
                    saved = true;
                }
                // Check for audio/voice
                else if (quotedMsg.audioMessage) {
                    buffer = await downloadMediaMessage(
                        { message: { audioMessage: quotedMsg.audioMessage }, key: msg.key },
                        'buffer', {}, { logger: pino({ level: 'silent' }) }
                    );
                    mediaType = 'audio';
                    saved = true;
                }
                // Check for document
                else if (quotedMsg.documentMessage) {
                    buffer = await downloadMediaMessage(
                        { message: { documentMessage: quotedMsg.documentMessage }, key: msg.key },
                        'buffer', {}, { logger: pino({ level: 'silent' }) }
                    );
                    mediaType = 'document';
                    originalCaption = quotedMsg.documentMessage.caption || '';
                    saved = true;
                }
                // Check for sticker
                else if (quotedMsg.stickerMessage) {
                    buffer = await downloadMediaMessage(
                        { message: { stickerMessage: quotedMsg.stickerMessage }, key: msg.key },
                        'buffer', {}, { logger: pino({ level: 'silent' }) }
                    );
                    mediaType = 'sticker';
                    saved = true;
                }
                
                if (!saved || !buffer) {
                    await sock.sendMessage(sender, { text: '❌ Could not detect media in the quoted message!' });
                    return;
                }
                
                caption = `💾 *SAVED CONTENT*\n\n` +
                         `*Type:* ${mediaType.toUpperCase()}\n` +
                         `*From:* ${senderName}\n` +
                         `*Chat:* ${isGroup ? 'Group' : 'Private'}\n` +
                         `*Time:* ${new Date().toLocaleString()}\n` +
                         (originalCaption ? `*Caption:* ${originalCaption}\n` : '');
                
                // Send to owner DM based on media type
                switch(mediaType) {
                    case 'image':
                        await sock.sendMessage(ownerJid, {
                            image: buffer,
                            caption: caption
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(ownerJid, {
                            video: buffer,
                            caption: caption
                        });
                        break;
                    case 'audio':
                        await sock.sendMessage(ownerJid, {
                            audio: buffer,
                            mimetype: 'audio/mp4',
                            ptt: quotedMsg.audioMessage?.ptt || false
                        });
                        // Send info separately for audio
                        await sock.sendMessage(ownerJid, { text: caption });
                        break;
                    case 'document':
                        await sock.sendMessage(ownerJid, {
                            document: buffer,
                            fileName: quotedMsg.documentMessage?.fileName || 'document',
                            mimetype: quotedMsg.documentMessage?.mimetype || 'application/octet-stream',
                            caption: caption
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(ownerJid, {
                            sticker: buffer
                        });
                        await sock.sendMessage(ownerJid, { text: caption });
                        break;
                }
                
                await sock.sendMessage(sender, { text: `✅ ${mediaType.toUpperCase()} saved to your DM!` });
                
            } catch (err) {
                console.log('Error saving media:', err);
                await sock.sendMessage(sender, { text: '❌ Failed to save. Try again!' });
            }
        }

        // ==================== CLEAR CHAT (.clear) ====================
        else if (cmd === '.clear') {
            try {
                // Get all messages in chat (last 100)
                const messages = await sock.loadMessages(sender, 100);
                
                if (!messages || messages.length === 0) {
                    await sock.sendMessage(sender, { text: 'ℹ️ No messages to clear!' });
                    return;
                }
                
                let deletedCount = 0;
                
                // Delete each message
                for (const message of messages) {
                    try {
                        if (!message.key.fromMe) { // Only delete others' messages
                            await sock.sendMessage(sender, { 
                                delete: {
                                    remoteJid: sender,
                                    fromMe: false,
                                    id: message.key.id,
                                    participant: message.key.participant || sender
                                }
                            });
                            deletedCount++;
                            // Small delay to avoid rate limit
                            await new Promise(r => setTimeout(r, 100));
                        }
                    } catch (e) {
                        // Skip if can't delete
                    }
                }
                
                await sock.sendMessage(sender, { text: `🧹 Cleared ${deletedCount} messages!` });
                
            } catch (err) {
                console.log('Error clearing chat:', err);
                await sock.sendMessage(sender, { text: '❌ Could not clear chat. Try manually!' });
            }
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
            const groups = await sock.groupFetchAllParticipating();
            const contacts = Object.keys(groups).filter(id => id.endsWith('@s.whatsapp.net'));
            
            await sock.sendMessage(sender, { text: `Broadcasting to ${contacts.length} contacts...` });
            
            for (const contact of contacts) {
                await new Promise(r => setTimeout(r, 1000));
                await sock.sendMessage(contact, { text: `*Broadcast:*\n\n${message}` });
            }
            await sock.sendMessage(sender, { text: '✅ Broadcast sent!' });
        }
        else if (command === '.bcmedia' && args.length > 1) {
            const caption = args.slice(1).join(' ');
            const groups = await sock.groupFetchAllParticipating();
            const contacts = Object.keys(groups).filter(id => id.endsWith('@s.whatsapp.net'));
            
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

        // ==================== GROUP MANAGEMENT ====================
        else if (command === '.creategroup' && args.length > 1) {
            const groupName = args.slice(1).join(' ');
            try {
                const group = await sock.groupCreate(groupName, [sock.user.id]);
                await sock.sendMessage(sender, { text: `✅ Group "${groupName}" created!\nID: ${group.id}` });
            } catch (err) {
                await sock.sendMessage(sender, { text: '❌ Could not create group. Try manually!' });
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
                text: `*Name:* ${metadata.subject}\n*Members:* ${metadata.participants.length}\n*Admins:* ${admins}`
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
            await sock.sendMessage(sender, { text: '🔗 Link revoked!' });
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
    });
}

connectToWhatsApp();
