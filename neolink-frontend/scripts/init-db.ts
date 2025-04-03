import pool from "../lib/db-connection"
import { hash } from "bcrypt"
import fs from "fs"
import path from "path"

async function initDb() {
  try {
    // Read and execute the schema SQL
    const schemaSQL = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8")
    await pool.query(schemaSQL)
    console.log("Database schema created")

    // Create initial users
    const users = [
      {
        username: "NetRunner_42",
        password: "password123",
        nodeId: "node-42abc1",
      },
      {
        username: "CyberPunk",
        privateKey: "secure-private-key-example",
        nodeId: "node-3b9c2d",
      },
      {
        username: "ShadowRunner",
        password: "shadow123",
        nodeId: "node-5e7f3a",
      },
      {
        username: "GhostInTheShell",
        privateKey: "ghost-private-key-example",
        nodeId: "node-1d4e8c",
      },
    ]

    console.log("Creating initial users...")

    for (const user of users) {
      const passwordHash = user.password ? await hash(user.password, 10) : null

      try {
        // Check if user exists
        const existingUser = await pool.query("SELECT * FROM users WHERE username = $1", [user.username])

        if (existingUser.rows.length === 0) {
          // Insert new user
          await pool.query(
            `INSERT INTO users (username, password_hash, private_key, node_id) 
             VALUES ($1, $2, $3, $4)`,
            [user.username, passwordHash, user.privateKey || null, user.nodeId],
          )
          console.log(`Created user: ${user.username}`)
        } else {
          console.log(`User ${user.username} already exists`)
        }
      } catch (error) {
        console.error(`Error creating user ${user.username}:`, error)
      }
    }

    console.log("Database initialization completed!")
  } catch (error) {
    console.error("Error initializing database:", error)
  } finally {
    await pool.end()
  }
}

initDb()

