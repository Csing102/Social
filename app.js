// Global Configuration Config mapping out target variables directly on client runtime scope
const SUPABASE_URL = "https://iblzdkqbnvircxtxjway.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlibHpka3FibnZpcmN4dHhqd2F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NTAxNDksImV4cCI6MjA5NjUyNjE0OX0.z1aa2tb8ePlK_sB_kgSO4IjGjzjoBONBgez_4XiwLAY";

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentSessionUser = null;
let activeChannelId = null;
let activeMediaRecorder = null;
let audioRecordingChunks = [];

// App Lifecycle Initializer Initialization
document.addEventListener("DOMContentLoaded", async () => {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) {
        if(window.location.pathname.endsWith("chat.html")) window.location.href = "index.html";
    } else {
        currentSessionUser = session.user;
        if(window.location.pathname.endsWith("index.html") || window.location.pathname === "/") window.location.href = "chat.html";
        else initializeChatAppWorkspace();
    }
});

async function initializeChatAppWorkspace() {
    loadUserIdentityProfileHeader();
    await renderChannelsSidebarList();
    establishRealtimeSubscriptionPipeline();
    
    // Bind Keyboard Entry Mechanics
    document.getElementById("msg-input")?.addEventListener("keydown", (e) => {
        if(e.key === "Enter" && e.target.value.trim() !== "") {
            dispatchTextMessage(e.target.value.trim());
            e.target.value = "";
        }
    });
}

// User Profile Fallback Mechanics
function loadUserIdentityProfileHeader() {
    _sb.from("profiles").select("*").eq("id", currentSessionUser.id).single().then(({data}) => {
        const avatarImg = data?.profile_picture || "https://raw.githubusercontent.com/Csing102/Wattz/refs/heads/main/user.jpeg";
        document.getElementById("user-avatar").src = avatarImg;
    });
}

// Load and Render Sidebars
async function renderChannelsSidebarList() {
    const container = document.getElementById("channels-container");
    if(!container) return;
    
    const { data: channels } = await _sb.from("channels").select("*").order("created_at", { ascending: false });
    container.innerHTML = "";
    
    channels?.forEach(chan => {
        const item = document.createElement("div");
        item.className = `flex items-center gap-3 p-3 cursor-pointer hover:bg-[#202c33] border-b border-[#222e35] transition ${activeChannelId === chan.id ? 'bg-[#2a3942]' : ''}`;
        item.onclick = () => selectActiveChannelTarget(chan.id, chan.name);
        item.innerHTML = `
            <div class="w-12 h-12 rounded-full bg-[#2a3942] flex items-center justify-center text-xl font-bold text-[#8696a0]">👥</div>
            <div class="flex-1">
                <h4 class="text-sm font-medium text-[#e9edef]">${chan.name || 'Group Chat'}</h4>
                <p class="text-xs text-[#8696a0] truncate">Click to open room pipeline</p>
            </div>
        `;
        container.appendChild(item);
    });
}

// Activate Target Selected Workspace
async function selectActiveChannelTarget(channelId, channelTitle) {
    activeChannelId = channelId;
    document.getElementById("active-chat-title").innerText = channelTitle;
    await renderChannelMessagesChain(channelId);
    await renderChannelsSidebarList();
}

// Render Messages Pipeline
async function renderChannelMessagesChain(channelId) {
    const stream = document.getElementById("messages-flow");
    if(!stream) return;
    
    const { data: messages } = await _sb.from("messages").select("*, profiles(name)").eq("channel_id", channelId).order("timestamp", { ascending: true });
    stream.innerHTML = "";
    
    messages?.forEach(msg => {
        const isMe = msg.sender_id === currentSessionUser.id;
        const wrapper = document.createElement("div");
        wrapper.className = `flex w-full ${isMe ? 'justify-end' : 'justify-start'}`;
        
        let mediaMarkup = "";
        if(msg.media_type === "image") mediaMarkup = `<img src="${msg.media_url}" class="rounded-lg max-w-xs max-h-60 object-cover my-1 mb-2">`;
        if(msg.media_type === "video") mediaMarkup = `<video src="${msg.media_url}" controls class="rounded-lg max-w-xs max-h-60 my-1 mb-2">`;
        if(msg.media_type === "audio") mediaMarkup = `<div class="voice-note-card">🎵 <audio src="${msg.media_url}" controls class="h-8 w-44"></audio></div>`;

        wrapper.innerHTML = `
            <div class="max-w-[70%] p-2 rounded-lg text-sm relative group ${isMe ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none' : 'bg-[#202c33] text-[#e9edef] rounded-tl-none'}">
                <p class="text-[11px] font-bold text-[#00a884] mb-0.5">${msg.profiles?.name || 'User'}</p>
                ${mediaMarkup}
                <p class="whitespace-pre-wrap break-words">${msg.is_deleted ? '<i class="text-[#8696a0]">This message was unsent</i>' : msg.content || ''}</p>
                <div class="flex items-center justify-end gap-1 mt-1 text-[10px] text-[#8696a0]">
                    <span>${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    ${msg.is_edited && !msg.is_deleted ? '<span>(edited)</span>' : ''}
                </div>
                ${isMe && !msg.is_deleted ? `
                    <div class="absolute top-1 right-1 hidden group-hover:flex gap-1 bg-[#233138] rounded p-1 shadow-md z-10">
                        <button onclick="editMessageChain('${msg.id}')" title="Edit">✏️</button>
                        <button onclick="unsendMessageChain('${msg.id}')" title="Unsend">🗑️</button>
                    </div>
                ` : ''}
            </div>
        `;
        stream.appendChild(wrapper);
    });
    stream.scrollTop = stream.scrollHeight;
}

// Persistent Real-Time Core Module Wireframes
function establishRealtimeSubscriptionPipeline() {
    _sb.channel('public:messages')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload) => {
        if(activeChannelId && payload.new && (payload.new.channel_id === activeChannelId || payload.old.channel_id === activeChannelId)) {
            await renderChannelMessagesChain(activeChannelId);
        }
    })
    .subscribe();
}

// Data Writing Layer Dispatch Methods
async function dispatchTextMessage(text, type = "text", url = null) {
    if(!activeChannelId) return alert("Select a dynamic target channel room first!");
    await _sb.from("messages").insert([{
        channel_id: activeChannelId,
        sender_id: currentSessionUser.id,
        content: text,
        media_url: url,
        media_type: type
    }]);
}

// Base64 File Storage Pipeline Conversion Engine Handling
function handleMediaUpload(inputElement, targetType) {
    const assetFile = inputElement.files[0];
    if(!assetFile) return;
    
    const fileReader = new FileReader();
    fileReader.readAsDataURL(assetFile);
    fileReader.onload = async () => {
        const runtimeBase64Url = fileReader.result;
        await dispatchTextMessage("", targetType, runtimeBase64Url);
        toggleMediaDropdown();
    };
}

// Integrated Audio Voice Note base64 encoding pipeline
async function toggleVoiceRecording() {
    const triggerBtn = document.getElementById("voice-record-btn");
    if(!activeMediaRecorder || activeMediaRecorder.state === "inactive") {
        const processingAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        activeMediaRecorder = new MediaRecorder(processingAudioStream);
        audioRecordingChunks = [];
        
        activeMediaRecorder.ondataavailable = e => audioRecordingChunks.push(e.data);
        activeMediaRecorder.onstop = () => {
            const compiledBlob = new Blob(audioRecordingChunks, { type: 'audio/ogg; codecs=opus' });
            const encodingReader = new FileReader();
            encodingReader.readAsDataURL(compiledBlob);
            encodingReader.onloadend = async () => {
                await dispatchTextMessage("", "audio", encodingReader.result);
            };
        };
        activeMediaRecorder.start();
        triggerBtn.classList.add("recording-active");
    } else {
        activeMediaRecorder.stop();
        triggerBtn.classList.remove("recording-active");
    }
}

// Edge Function Hooks calling Giphy & iTunes proxy API integrations safely
async function promptGiphy() {
    const query = prompt("Search matching Giphy asset keys:");
    if(!query) return;
    const { data, error } = await _sb.functions.invoke('media-enrichment', { body: { type: 'gif', query } });
    if(data?.data?.[0]?.images?.original?.url) {
        await dispatchTextMessage("", "image", data.data[0].images.original.url);
    }
    toggleMediaDropdown();
}

async function promptTunes() {
    const query = prompt("Search iTunes for a 30-second audio track preview:");
    if(!query) return;
    const { data } = await _sb.functions.invoke('media-enrichment', { body: { type: 'music', query } });
    if(data?.results?.[0]?.previewUrl) {
        await dispatchTextMessage(data.results[0].trackName, "audio", data.results[0].previewUrl);
    }
    toggleMediaDropdown();
}

// Unsend & Edit Logic Mutations 
async function unsendMessageChain(msgId) {
    await _sb.from("messages").update({ is_deleted: true, content: null, media_url: null, media_type: null }).eq("id", msgId);
}

async function editMessageChain(msgId) {
    const revisedText = prompt("Revise target message text content context:");
    if(!revisedText) return;
    await _sb.from("messages").update({ content: revisedText, is_edited: true }).eq("id", msgId);
}

// Custom View Toggling Helpers
function toggleMediaDropdown() {
    document.getElementById("media-dropdown").classList.toggle("hidden");
}
function toggleProfileEdit() {
    document.getElementById("profile-modal").classList.toggle("hidden");
}
async function saveProfileChanges() {
    const name = document.getElementById("edit-display-name").value;
    const profile_picture = document.getElementById("edit-avatar-url").value;
    await _sb.from("profiles").update({ name, profile_picture }).eq("id", currentSessionUser.id);
    toggleProfileEdit();
    loadUserIdentityProfileHeader();
}
async function createNewChat() {
    const roomTitle = prompt("Provide alphanumeric room channel identity text:");
    if(!roomTitle) return;
    await _sb.from("channels").insert([{ name: roomTitle, is_group: true }]);
    await renderChannelsSidebarList();
}
async function logout() {
    await _sb.auth.signOut();
    window.location.href = "index.html";
}
