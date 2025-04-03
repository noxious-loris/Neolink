import { hash, compare } from "bcrypt"
import pool from "./db-connection"

// Types for our database models
export type User = {
  id: string
  username: string
  passwordHash?: string
  privateKey?: string
  nodeId: string
  createdAt: Date
  lastLogin?: Date
}

// Database operations
export async function findUserByUsername(username: string): Promise<User | null> {
  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username])

    if (result.rows.length === 0) {
      return null
    }

    const user = result.rows[0]
    return {
      id: user.id.toString(),
      username: user.username,
      passwordHash: user.password_hash,
      privateKey: user.private_key,
      nodeId: user.node_id,
      createdAt: new Date(user.created_at),
      lastLogin: user.last_login ? new Date(user.last_login) : undefined,
    }
  } catch (error) {
    console.error("Error finding user by username:", error)
    throw error
  }
}

export async function findUserByPrivateKey(privateKey: string): Promise<User | null> {
  try {
    const result = await pool.query("SELECT * FROM users WHERE private_key = $1", [privateKey])

    if (result.rows.length === 0) {
      return null
    }

    const user = result.rows[0]
    return {
      id: user.id.toString(),
      username: user.username,
      passwordHash: user.password_hash,
      privateKey: user.private_key,
      nodeId: user.node_id,
      createdAt: new Date(user.created_at),
      lastLogin: user.last_login ? new Date(user.last_login) : undefined,
    }
  } catch (error) {
    console.error("Error finding user by private key:", error)
    throw error
  }
}

export async function findUserByNodeId(nodeId: string): Promise<User | null> {
  try {
    const result = await pool.query("SELECT * FROM users WHERE node_id = $1", [nodeId])

    if (result.rows.length === 0) {
      return null
    }

    const user = result.rows[0]
    return {
      id: user.id.toString(),
      username: user.username,
      passwordHash: user.password_hash,
      privateKey: user.private_key,
      nodeId: user.node_id,
      createdAt: new Date(user.created_at),
      lastLogin: user.last_login ? new Date(user.last_login) : undefined,
    }
  } catch (error) {
    console.error("Error finding user by node ID:", error)
    throw error
  }
}

export async function createUser(userData: {
  username: string
  password?: string
  privateKey?: string
  nodeId: string
}): Promise<User> {
  try {
    // Check if user already exists
    const existingUser = await findUserByUsername(userData.username)
    if (existingUser) {
      throw new Error("Username already exists")
    }

    // Check if nodeId already exists
    const existingNodeId = await findUserByNodeId(userData.nodeId)
    if (existingNodeId) {
      throw new Error("Node ID already in use")
    }

    // Hash password if provided
    const passwordHash = userData.password ? await hash(userData.password, 10) : null

    // Insert new user
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, private_key, node_id) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [userData.username, passwordHash, userData.privateKey, userData.nodeId],
    )

    const user = result.rows[0]
    return {
      id: user.id.toString(),
      username: user.username,
      passwordHash: user.password_hash,
      privateKey: user.private_key,
      nodeId: user.node_id,
      createdAt: new Date(user.created_at),
      lastLogin: user.last_login ? new Date(user.last_login) : undefined,
    }
  } catch (error) {
    console.error("Error creating user:", error)
    throw error
  }
}

export async function updateLastLogin(userId: string): Promise<void> {
  try {
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [userId])
  } catch (error) {
    console.error("Error updating last login:", error)
    throw error
  }
}

export async function getAllUsers(): Promise<User[]> {
  try {
    const result = await pool.query("SELECT * FROM users ORDER BY created_at DESC")

    return result.rows.map((user) => ({
      id: user.id.toString(),
      username: user.username,
      passwordHash: "[REDACTED]",
      privateKey: user.private_key ? "[REDACTED]" : undefined,
      nodeId: user.node_id,
      createdAt: new Date(user.created_at),
      lastLogin: user.last_login ? new Date(user.last_login) : undefined,
    }))
  } catch (error) {
    console.error("Error getting all users:", error)
    throw error
  }
}

export async function verifyCredentials(username: string, password: string): Promise<User | null> {
  try {
    const user = await findUserByUsername(username)

    if (!user || !user.passwordHash) {
      return null
    }

    const passwordMatch = await compare(password, user.passwordHash)
    if (!passwordMatch) {
      return null
    }

    return user
  } catch (error) {
    console.error("Error verifying credentials:", error)
    throw error
  }
}

export async function updateUser(
  userId: string,
  data: {
    username?: string
    passwordHash?: string
    privateKey?: string
    nodeId?: string
  },
): Promise<User | null> {
  try {
    // Build the SET part of the query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (data.username) {
      updates.push(`username = $${paramIndex}`)
      values.push(data.username)
      paramIndex++
    }

    if (data.passwordHash) {
      updates.push(`password_hash = $${paramIndex}`)
      values.push(data.passwordHash)
      paramIndex++
    }

    if (data.privateKey) {
      updates.push(`private_key = $${paramIndex}`)
      values.push(data.privateKey)
      paramIndex++
    }

    if (data.nodeId) {
      updates.push(`node_id = $${paramIndex}`)
      values.push(data.nodeId)
      paramIndex++
    }

    if (updates.length === 0) {
      return null
    }

    // Add the user ID as the last parameter
    values.push(userId)

    const result = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    )

    if (result.rows.length === 0) {
      return null
    }

    const user = result.rows[0]
    return {
      id: user.id.toString(),
      username: user.username,
      passwordHash: user.password_hash,
      privateKey: user.private_key,
      nodeId: user.node_id,
      createdAt: new Date(user.created_at),
      lastLogin: user.last_login ? new Date(user.last_login) : undefined,
    }
  } catch (error) {
    console.error("Error updating user:", error)
    throw error
  }
}

export async function deleteUser(userId: string): Promise<boolean> {
  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [userId])

    return result.rows.length > 0
  } catch (error) {
    console.error("Error deleting user:", error)
    throw error
  }
}

export async function searchUsers(query: string, limit = 10): Promise<User[]> {
  try {
    const result = await pool.query(
      `SELECT * FROM users 
       WHERE username ILIKE $1 OR node_id ILIKE $1 
       ORDER BY username ASC 
       LIMIT $2`,
      [`%${query}%`, limit],
    )

    return result.rows.map((user) => ({
      id: user.id.toString(),
      username: user.username,
      passwordHash: "[REDACTED]",
      privateKey: user.private_key ? "[REDACTED]" : undefined,
      nodeId: user.node_id,
      createdAt: new Date(user.created_at),
      lastLogin: user.last_login ? new Date(user.last_login) : undefined,
    }))
  } catch (error) {
    console.error("Error searching users:", error)
    throw error
  }
}

export async function getUserStats(): Promise<{
  totalUsers: number
  activeUsersLast24h: number
  newUsersLast7d: number
}> {
  try {
    const [totalResult, activeResult, newResult] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users"),
      pool.query("SELECT COUNT(*) FROM users WHERE last_login > NOW() - INTERVAL '24 hours'"),
      pool.query("SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days'"),
    ])

    return {
      totalUsers: Number.parseInt(totalResult.rows[0].count),
      activeUsersLast24h: Number.parseInt(activeResult.rows[0].count),
      newUsersLast7d: Number.parseInt(newResult.rows[0].count),
    }
  } catch (error) {
    console.error("Error getting user stats:", error)
    throw error
  }
}

