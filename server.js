const app = require('express')();
require('dotenv').config()
const server = require('http').Server(app);
const io = require('socket.io')(server);
const config = require("./lib/config");
const Chat = require('./models/ChatSchema');
const User = require('./models/UserSchema');
const Message = require('./models/MsgSchema');
const bodyParser = require('body-parser')
const mongooseConfig = require("./lib/mongoose-config");

app.use( bodyParser.json() );
app.use(bodyParser.urlencoded({
    extended: true
}));

const types = {
    common: 'common',
    general: 'general',
    private: 'private',
    group: 'group'
}

let connectedUsers = [];

function getUserSocketId(userId) {
    return Object.keys(connectedUsers).filter(val => connectedUsers[val] === userId)[0]
}

io.on("connection", socket => {
    console.log('user connected', socket.id)

    socket.on('socket/SET_USER_ID', async function (action) {
      connectedUsers[socket.id.toString()] = action
      console.log(connectedUsers)
    })
    socket.on('socket/GET_ITEMS', async function (action) {
        function sendMessages(msg) {
            socket.emit('socket/GET_ITEMS', {
                type: 'SET_ITEMS',
                payload: msg.reverse()
            })
        }
        let privateDialog = await Chat.findOne({
            chatId: action.dialogId
        })
        if(privateDialog) {
            let messages = await Message.find({chatId: privateDialog.chatId})
            sendMessages(messages)
        } 
    })
    socket.on('socket/GET_DIALOGS', async function (action) {
        const dialogsIds = action.dialogs;
        let dialogs = [];
        await dialogsIds.forEach( async function(id) {
            let currentDialog = await Chat.findOne({chatId: id})
            dialogs.push(currentDialog);
        });
        if(dialogs) {
            socket.emit('socket/GET_DIALOGS', {
                type: 'SET_DIALOGS',
                payload: dialogs
            })
        }
    })
    socket.on('socket/DELETE_DIALOGS', async function (action) {
        const deleteDialogs = await Chat.deleteOne({chatId: action.id});
        const user = await User.findById(action.userId);

        const dialogs = await Chat.find();
        if(dialogs) {
            socket.emit('socket/DELETE_DIALOGS', {
                type: 'SET_DIALOGS',
                payload: dialogs
            })
        }
    })

    socket.on('socket/CREATE_ROOM', async function (action) {
        let userIds = [];
        if (action.type === 'private') {
            userIds = [action.to, action.authId]
        } else {
            userIds = [...action.to, action.authId]
        }
        dialog = await new Chat({
            type: action.type,
            chatId: socket.id,
            userIds: userIds
        })
        const save = await dialog.save();
        if (save) {
            console.log('123')
            socket.emit('socket/CREATE_ROOM', {
                type: 'SET_ROOM_ID',
                payload: {
                    type: action.type,
                    id: socket.id
                }
            })
            if(Array.isArray(action.to)) {
                action.to.forEach(el => {
                    if(getUserSocketId(el)) {
                        io.sockets.sockets[getUserSocketId(el)].emit({
                            type: 'UPDATE_DIALOGS',
                            payload: el
                        });
                    }
                });
            } else {
                if(getUserSocketId(action.to)) {
                    io.sockets.sockets[getUserSocketId(action.to)].emit({
                        type: 'UPDATE_DIALOGS',
                        payload: action.to
                    });
                }
            }
        }
    })

    socket.on('socket/ADD_MESSAGE', async function (action) {
        let dialog = await Chat.findOne({chatId: action.chatId})
        if(dialog) {
            const message = await new Message({
                fromId: action.sender, 
                message: action.message, 
                chatId: dialog.chatId
            })
            let save = await message.save();
            if(save) {
                socket.broadcast.emit('socket/ADD_MESSAGE', {
                    type: 'SET_MESSAGE',
                    payload: message
                })
                socket.emit('socket/ADD_MESSAGE', {
                    type: 'SET_MESSAGE',
                    payload: message
                });
            }
        }
    })

    socket.on('socket/GET_FIRST_MESSAGE', async function (action) {
        if(action.id) {
            let message = await Message.find({chatId: action.id}).limit(1).sort({$natural:-1})
            socket.emit('socket/GET_FIRST_MESSAGE', {
                type: 'SET_FIRST_MESSAGE',
                payload: {
                    id: action.id,
                    message: message[0],
                }
            });
        }
    })


    socket.on('disconnect', function () {
      console.log('user disconnected', connectedUsers[socket.id] );
      delete connectedUsers[socket.id]
  });
})

server.listen(config.port, () => {
    mongooseConfig();
    console.log(`Server started on port: ${config.port}`)
});