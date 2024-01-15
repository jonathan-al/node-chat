import express from "express"
import logger from "morgan"
import dotenv from "dotenv"
import { createClient } from "@libsql/client"
import { Server } from 'socket.io'
import { createServer } from 'node:http'

dotenv.config()

const port = process.env.PORT ?? 3000
const app = express()
const server = createServer(app)

const io = new Server(server, {
  connectionStateRecovery: {}
})

const db = createClient({
  url: 'libsql://included-bloodberry-jonathan-al.turso.io',
  authToken: process.env.DB_TOKEN
})

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`)

io.on('connection', async (socket) => {
  console.log('a user has connected!')

  socket.on('disconnect', () => {
    console.log('an user has disconnected')
  })

  socket.on('chat message', async (msg) => {
    console.log('<<< server chat message >>>')
    let result
    const username = socket.handshake.auth.username ?? 'anonymous'
    console.log({ username })
    try {
      result = await db.execute({
        sql: 'INSERT INTO messages (content, user) VALUES (:msg, :username)',
        args: { msg, username }
      })
    } catch (e) {
      console.error(e)
      return
    }
    // this is important, use io.emit to emitt all connected clients
    // because socket.emit, only emits to the connected socket
    io.emit('chat message', msg, result.lastInsertRowid.toString(), username)
  })

  // recover offline messages
  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: 'SELECT id, content, user FROM messages WHERE id > ?',
        args: [socket.handshake.auth.serverOffset ?? 0]
      })

      results.rows.forEach(row => {
        socket.emit('chat message', row.content, row.id.toString(), row.user)
      })
    } catch (e) {
      console.error(e)
    }
  }
})

/* logger */
app.use(logger('dev'))

/* set route */
app.get('/', (req, res) => {
  /* loads an html */
  // res.send('<h1>This is the chat</h1>')

  /* loads a file */
  res.sendFile(process.cwd() + '/client/index.html')
})

/* and enable port 3000 */
server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})