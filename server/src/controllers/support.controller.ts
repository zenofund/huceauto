import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { socketService } from '../services/socket.service';
import { createNotification } from './notification.controller';

const prisma = new PrismaClient();

// Create a new support ticket
export const createTicket = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { subject, priority, initialMessage } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!subject || !initialMessage) {
      return res.status(400).json({ error: 'Subject and initial message are required' });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        subject,
        priority: priority || 'MEDIUM',
        messages: {
          create: {
            senderId: userId,
            content: initialMessage,
            isAdmin: false,
          }
        }
      },
      include: {
        messages: true,
      }
    });

    // Notify admins via Socket.io
    socketService.notifyNewTicket(ticket);

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({ error: 'Failed to create support ticket' });
  }
};

// Get all tickets for a user
export const getTickets = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;
    const skip = (page - 1) * limit;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    let where: any = {};
    if (role !== 'ADMIN') {
      where.userId = userId;
    }

    if (status && status !== 'All Ticket') {
      const statusMap: { [key: string]: string } = {
        'Open Ticket': 'OPEN',
        'Closed Ticket': 'RESOLVED'
      };
      if (statusMap[status]) {
        where.status = statusMap[status];
      }
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            }
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.supportTicket.count({ where })
    ]);

    res.json({
      data: tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({ error: 'Failed to fetch support tickets' });
  }
};

// Get ticket details and messages
export const getTicketDetails = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: id as string },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check authorization
    if (role !== 'ADMIN' && ticket.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to view this ticket' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket details:', error);
    res.status(500).json({ error: 'Failed to fetch ticket details' });
  }
};

// Send a message in a ticket
export const sendSupportMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    const { id: ticketId } = req.params;
    const { content } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId as string }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check authorization
    if (role !== 'ADMIN' && ticket.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to post to this ticket' });
    }

    const message = await prisma.supportMessage.create({
      data: {
        ticketId: ticketId as string,
        senderId: userId,
        content,
        isAdmin: role === 'ADMIN'
      }
    });

    // Update ticket's updatedAt timestamp
    await prisma.supportTicket.update({
      where: { id: ticketId as string },
      data: { updatedAt: new Date() }
    });

    // Send via Socket.io
    socketService.sendSupportMessage(ticketId as string, message);

    // If admin replied, notify the user
    if (role === 'ADMIN') {
      await createNotification(ticket.userId, {
        title: 'Support Update',
        message: 'You have received a reply from our support team.',
        type: 'SYSTEM',
        link: `/support?ticket=${ticketId}`
      });
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending support message:', error);
    res.status(500).json({ error: 'Failed to send support message' });
  }
};

// Update ticket status
export const updateTicketStatus = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role;
    const { id } = req.params;
    const { status } = req.body;

    if (role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can update ticket status' });
    }

    const ticket = await prisma.supportTicket.update({
      where: { id: id as string },
      data: { status }
    });

    // Notify user and admins via Socket.io
    socketService.notifyTicketStatusUpdate(id as string, status, ticket.userId);

    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
};
