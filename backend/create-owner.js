require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function createOwner() {
  const prisma = new PrismaClient();

  try {
    const ownerUsername = process.env.OWNER_USERNAME || 'admin';
    const ownerPassword = process.env.OWNER_PASSWORD || 'change-me-123';
    const ownerEmail = process.env.OWNER_EMAIL || 'owner@painel.local';

    const existing = await prisma.panelUser.findUnique({ where: { username: ownerUsername } });
    if (existing) {
      console.log('Usuario OWNER ja existe');
      return;
    }

    const hashed = await bcrypt.hash(ownerPassword, 12);
    const user = await prisma.panelUser.create({
      data: {
        email: ownerEmail,
        username: ownerUsername,
        passwordHash: hashed,
        role: 'OWNER',
        isActive: true,
      },
    });

    console.log('Usuario OWNER criado:', user.username);
  } catch (error) {
    console.error('Erro ao criar usuario:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createOwner();
