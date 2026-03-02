import { Request, Response } from 'express';
import { PrismaClient, InspectionStatus, TransactionType, TransactionStatus, Role } from '@prisma/client';
import { notifyNewInspectionRequest, notifyInspectionClaimed, notifyInspectionCompleted } from '../utils/notifications';
import { createNotification } from './notification.controller';

const prisma = new PrismaClient();
const INSPECTION_FEE = 5000; // Fixed fee for inspection

export const createInspectionRequest = async (req: any, res: Response) => {
  try {
    const { carId, preferredDate, location, notes } = req.body;
    const { userId } = req.user;

    // Check if car exists
    const car = await prisma.car.findUnique({
      where: { id: carId },
      include: { seller: true }
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    // Check if user has enough balance in wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet || Number(wallet.balance) < INSPECTION_FEE) {
      return res.status(400).json({ error: 'Insufficient wallet balance. Please top up to request inspection.' });
    }

    // Use transaction to deduct fee and create request
    const inspection = await prisma.$transaction(async (tx) => {
      // 1. Deduct from buyer wallet
      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: INSPECTION_FEE } }
      });

      // 2. Create transaction record
      await tx.transaction.create({
        data: {
          userId,
          amount: INSPECTION_FEE,
          type: TransactionType.INSPECTION_FEE,
          status: TransactionStatus.SUCCESS,
          description: `Inspection request for ${car.year} ${car.make} ${car.model}`,
          reference: `INS-REQ-${Date.now()}-${carId.substring(0, 8)}`
        }
      });

      // 3. Create inspection request
      return await tx.inspection.create({
        data: {
          carId,
          buyerId: userId,
          scheduledDate: preferredDate ? new Date(preferredDate) : null,
          status: InspectionStatus.REQUESTED,
          fee: INSPECTION_FEE,
          reportData: notes || ''
        },
        include: {
          car: true,
          buyer: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      });
    });

    // Notify all inspectors
    const inspectors = await prisma.user.findMany({
      where: { role: Role.INSPECTOR },
      select: { id: true, email: true, phone: true }
    });
    
    await notifyNewInspectionRequest(inspectors, `${car.year} ${car.make} ${car.model}`);

    // Create in-app notifications for all inspectors
    for (const inspector of inspectors) {
      await createNotification(inspector.id, {
        title: 'New Inspection Request',
        message: `A new inspection request for ${car.year} ${car.make} ${car.model} is available.`,
        type: 'INSPECTION',
        link: '#inspector-dashboard'
      });
    }

    res.status(201).json(inspection);
  } catch (error) {
    console.error('Error creating inspection request:', error);
    res.status(500).json({ error: 'Failed to create inspection request' });
  }
};

export const getAvailableInspections = async (req: any, res: Response) => {
  try {
    const inspections = await prisma.inspection.findMany({
      where: {
        status: InspectionStatus.REQUESTED,
        inspectorId: null
      },
      include: {
        car: true,
        buyer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(inspections);
  } catch (error) {
    console.error('Error fetching available inspections:', error);
    res.status(500).json({ error: 'Failed to fetch available inspections' });
  }
};

export const getInspectionsByCarId = async (req: any, res: Response) => {
  try {
    const { carId } = req.params;
    
    const inspections = await prisma.inspection.findMany({
      where: { carId },
      include: {
        inspector: {
          select: {
            firstName: true,
            lastName: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(inspections);
  } catch (error) {
    console.error('Error fetching inspections:', error);
    res.status(500).json({ error: 'Failed to fetch inspections' });
  }
};

export const getInspectorInspections = async (req: any, res: Response) => {
  try {
    const { userId } = req.user;

    const inspections = await prisma.inspection.findMany({
      where: { inspectorId: userId },
      include: {
        car: true,
        buyer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        report: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(inspections);
  } catch (error) {
    console.error('Error fetching inspector inspections:', error);
    res.status(500).json({ error: 'Failed to fetch inspections' });
  }
};

export const getInspectorStats = async (req: any, res: Response) => {
  try {
    const { userId } = req.user;

    const [totalInspections, activeInspections, completedInspections, revenue] = await Promise.all([
      prisma.inspection.count({ where: { inspectorId: userId } }),
      prisma.inspection.count({ 
        where: { 
          inspectorId: userId,
          status: { in: [InspectionStatus.SCHEDULED, InspectionStatus.IN_PROGRESS] }
        } 
      }),
      prisma.inspection.count({ where: { inspectorId: userId, status: InspectionStatus.COMPLETED } }),
      prisma.wallet.findUnique({ where: { userId }, select: { balance: true } })
    ]);

    res.json({
      totalInspections,
      activeInspections,
      completedInspections,
      revenue: revenue?.balance || 0
    });
  } catch (error) {
    console.error('Error fetching inspector stats:', error);
    res.status(500).json({ error: 'Failed to fetch inspector stats' });
  }
};

export const assignInspector = async (req: any, res: Response) => {
  try {
    const { inspectionId } = req.params;
    const { userId } = req.user;

    const inspection = await prisma.inspection.update({
      where: { id: inspectionId },
      data: {
        inspectorId: userId,
        status: InspectionStatus.SCHEDULED
      },
      include: {
        car: true,
        buyer: {
          select: {
            email: true,
            phone: true,
            firstName: true
          }
        },
        inspector: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Notify buyer
    if (inspection.buyer) {
      await notifyInspectionClaimed(
        inspection.buyer,
        `${inspection.car.year} ${inspection.car.make} ${inspection.car.model}`,
        `${inspection.inspector?.firstName} ${inspection.inspector?.lastName}`
      );
    }

    res.json(inspection);
  } catch (error) {
    console.error('Error assigning inspector:', error);
    res.status(500).json({ error: 'Failed to assign inspector' });
  }
};

export const submitInspectionReport = async (req: any, res: Response) => {
  try {
    const { inspectionId } = req.params;
    const {
      exteriorScore, interiorScore, engineScore,
      suspensionScore, tiresScore, lightsScore,
      exteriorStatus, interiorStatus, engineStatus,
      suspensionStatus, tiresStatus, lightsStatus,
      recommendations, photos
    } = req.body;
    const { userId } = req.user;

    // Verify inspection exists and belongs to this inspector
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId }
    });

    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    if (inspection.inspectorId !== userId) {
      return res.status(403).json({ error: 'You are not authorized to submit this report' });
    }

    // Calculate average score
    const scores = [exteriorScore, interiorScore, engineScore, suspensionScore, tiresScore, lightsScore];
    const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Create compact report data for frontend display
    const compactReportData = JSON.stringify({
      exterior: {
        rating: exteriorScore,
        comment: exteriorStatus
      },
      interior: {
        rating: interiorScore,
        comment: interiorStatus
      },
      engine: {
        rating: engineScore,
        comment: engineStatus
      },
      suspension: {
        rating: suspensionScore,
        comment: suspensionStatus
      },
      tires: {
        rating: tiresScore,
        comment: tiresStatus
      },
      electrical: {
        rating: lightsScore,
        comment: lightsStatus
      },
      averageScore,
      recommendations: recommendations ? [recommendations] : [],
      photos: photos || []
    });

    // Create report and update inspection status
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create/Update the report
      const report = await tx.inspectionReport.upsert({
        where: { inspectionId },
        create: {
          inspectionId,
          exteriorScore, interiorScore, engineScore,
          suspensionScore, tiresScore, lightsScore,
          exteriorStatus, interiorStatus, engineStatus,
          suspensionStatus, tiresStatus, lightsStatus,
          recommendations,
          photos: photos || []
        },
        update: {
          exteriorScore, interiorScore, engineScore,
          suspensionScore, tiresScore, lightsScore,
          exteriorStatus, interiorStatus, engineStatus,
          suspensionStatus, tiresStatus, lightsStatus,
          recommendations,
          photos: photos || []
        }
      });

      // 2. Update inspection status, score and reportData
      const updatedInspection = await tx.inspection.update({
        where: { id: inspectionId },
        data: {
          status: InspectionStatus.COMPLETED,
          completedDate: new Date(),
          score: averageScore,
          reportData: compactReportData
        }
      });

      // 3. Credit inspector's wallet
      await tx.wallet.upsert({
        where: { userId },
        create: {
          userId,
          balance: INSPECTION_FEE,
          currency: 'NGN'
        },
        update: {
          balance: { increment: INSPECTION_FEE }
        }
      });

      // 4. Create transaction record for inspector
      await tx.transaction.create({
        data: {
          userId,
          amount: INSPECTION_FEE,
          type: TransactionType.INSPECTION_EARNING,
          status: TransactionStatus.SUCCESS,
          description: `Earnings for completed inspection: ${inspectionId}`,
          reference: `INS-EARN-${Date.now()}-${inspectionId.substring(0, 8)}`
        }
      });

      return { report, inspection: updatedInspection };
    });

    // Notify buyer that report is ready
    const fullInspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: {
        car: true,
        buyer: {
          select: {
            email: true,
            phone: true
          }
        }
      }
    });

    if (fullInspection?.buyer) {
      await notifyInspectionCompleted(
        fullInspection.buyer,
        `${fullInspection.car.year} ${fullInspection.car.make} ${fullInspection.car.model}`
      );
    }

    res.json(result);
  } catch (error) {
    console.error('Error submitting inspection report:', error);
    res.status(500).json({ error: 'Failed to submit inspection report' });
  }
};

export const uploadInspectionPhotos = async (req: any, res: Response) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' });
    }

    const photoUrls = req.files.map((file: any) => file.path);
    res.json({ photoUrls });
  } catch (error) {
    console.error('Error uploading inspection photos:', error);
    res.status(500).json({ error: 'Failed to upload photos' });
  }
};
