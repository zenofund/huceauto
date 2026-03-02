import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || '';

if (!JWT_SECRET) {
  console.error('JWT_SECRET is not defined in environment variables for SocketService');
}

const secret: string = JWT_SECRET;
const prisma = new PrismaClient();

interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    role: string;
  };
}

class SocketService {
  private io: SocketIOServer | null = null;
  private userSockets = new Map<string, string[]>(); // userId -> socketIds[]

  public init(httpServer: HttpServer) {
    const allowedOrigins = [
      'https://huceautos.com',
      'https://www.huceautos.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:5173',
      process.env.FRONTEND_URL,
      'https://huce-autos.up.railway.app'
    ].filter(Boolean) as string[];

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // Middleware for authentication
    this.io.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      try {
        const decoded = jwt.verify(token, secret) as { userId: string; role: string };
        socket.user = decoded;
        next();
      } catch (err) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', (socket: AuthenticatedSocket) => {
      const userId = socket.user?.userId;
      console.log(`User connected: ${userId} (Socket: ${socket.id})`);

      if (userId) {
        // Add socket to user's list
        const sockets = this.userSockets.get(userId) || [];
        this.userSockets.set(userId, [...sockets, socket.id]);
        
        // Join a private room for the user
        socket.join(`user:${userId}`);

        // Join admin room if applicable
        if (socket.user?.role === 'ADMIN') {
          socket.join('admin');
          console.log(`Admin joined admin room: ${userId}`);
        }
      }

      socket.on('disconnect', () => {
        if (userId) {
          const sockets = this.userSockets.get(userId) || [];
          const updatedSockets = sockets.filter(id => id !== socket.id);
          if (updatedSockets.length > 0) {
            this.userSockets.set(userId, updatedSockets);
          } else {
            this.userSockets.delete(userId);
          }
        }
        console.log(`User disconnected: ${userId} (Socket: ${socket.id})`);
      });

      // Join support ticket room
      socket.on('join_ticket', (ticketId: string) => {
        socket.join(`ticket:${ticketId}`);
        console.log(`Socket ${socket.id} joined ticket room: ${ticketId}`);
      });

      // Leave support ticket room
      socket.on('leave_ticket', (ticketId: string) => {
        socket.leave(`ticket:${ticketId}`);
        console.log(`Socket ${socket.id} left ticket room: ${ticketId}`);
      });
    });

    return this.io;
  }

  // Send a direct message notification
  public sendDirectMessage(receiverId: string, message: any) {
    if (this.io) {
      this.io.to(`user:${receiverId}`).emit('new_message', message);
    }
  }

  // Send a support message notification
  public sendSupportMessage(ticketId: string, message: any) {
    if (this.io) {
      this.io.to(`ticket:${ticketId}`).emit('new_support_message', message);
    }
  }

  // Notify admins about a new ticket
  public notifyNewTicket(ticket: any) {
    if (this.io) {
      this.io.to('admin').emit('new_support_ticket', ticket);
    }
  }

  // Notify user and admins about ticket status update
  public notifyTicketStatusUpdate(ticketId: string, status: string, userId: string) {
    if (this.io) {
      const data = { ticketId, status };
      this.io.to(`ticket:${ticketId}`).emit('support_ticket_status_updated', data);
      this.io.to(`user:${userId}`).emit('support_ticket_status_updated', data);
      this.io.to('admin').emit('support_ticket_status_updated', data);
    }
  }

  public getIO() {
    return this.io;
  }
}

export const socketService = new SocketService();
