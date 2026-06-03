import { cookies } from 'next/headers'

const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-secret'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234'

export async function getSession() {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('food-order-session')
    if (!sessionCookie) return null
    try {
        const decoded = Buffer.from(sessionCookie.value, 'base64').toString()
        if (decoded === `authenticated:${SESSION_SECRET}`) {
            return { authenticated: true }
        }
    } catch {
        return null
    }
    return null
}

export async function createSession() {
    const token = Buffer.from(`authenticated:${SESSION_SECRET}`).toString('base64')
    return token
}

import { prisma } from './prisma'

export async function checkPassword(password: string) {
    try {
        const settings = await prisma.appSettings.findFirst()

        if (settings?.adminPassword) {
            return password === settings.adminPassword
        }

        // No DB password yet — validate against env, then migrate to DB automatically
        const envPass = ADMIN_PASSWORD
        if (password !== envPass) return false

        if (settings) {
            await prisma.appSettings.update({
                where: { id: settings.id },
                data: { adminPassword: envPass },
            })
        } else {
            await prisma.appSettings.create({
                data: { shopName: 'ร้านอาหาร', adminPassword: envPass },
            })
        }
        return true
    } catch (err) {
        console.error('Failed to query app settings for password:', err)
        return password === ADMIN_PASSWORD
    }
}
