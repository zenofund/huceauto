import { Request, Response } from 'express';
import { PrismaClient, OfferStatus, InspectionStatus, TransactionType, TransactionStatus } from '@prisma/client';

const prisma = new PrismaClient();

export const getBuyerStats = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 1. Total Purchases (Transactions of type PURCHASE and status SUCCESS)
    const purchasesCount = await prisma.transaction.count({
      where: {
        userId: String(id),
        type: TransactionType.PURCHASE,
        status: TransactionStatus.SUCCESS,
      },
    });

    // 2. Offers Stats
    const totalOffers = await prisma.offer.count({
      where: {
        buyerId: String(id),
      },
    });

    const acceptedOffers = await prisma.offer.count({
      where: {
        buyerId: String(id),
        status: OfferStatus.ACCEPTED,
      },
    });

    const rejectedOffers = await prisma.offer.count({
      where: {
        buyerId: String(id),
        status: OfferStatus.REJECTED,
      },
    });

    // 3. Saved Cars
    const savedCarsCount = await prisma.savedCar.count({
      where: {
        userId: String(id),
      },
    });

    // 4. Inspections
    const inspectionsCount = await prisma.inspection.count({
      where: {
        buyerId: String(id),
      },
    });

    // 5. Unread Messages
    const unreadMessagesCount = await prisma.message.count({
      where: {
        receiverId: String(id),
        read: false,
      },
    });

    res.json({
      purchases: purchasesCount,
      offers: {
        total: totalOffers,
        accepted: acceptedOffers,
        rejected: rejectedOffers,
      },
      savedCars: savedCarsCount,
      inspections: inspectionsCount,
      unreadMessages: unreadMessagesCount,
    });
  } catch (error) {
    console.error('Error fetching buyer stats:', error);
    res.status(500).json({ error: 'Failed to fetch buyer statistics' });
  }
};

export const getBuyerActivities = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, page = 1, limit = 10 } = req.query as any;
    const p = parseInt(page);
    const l = parseInt(limit);
    const skip = (p - 1) * l;

    if (type === 'purchases') {
      const [purchases, total] = await Promise.all([
        prisma.transaction.findMany({
          where: {
            userId: String(id),
            type: TransactionType.PURCHASE,
            status: TransactionStatus.SUCCESS,
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: l,
        }),
        prisma.transaction.count({
          where: {
            userId: String(id),
            type: TransactionType.PURCHASE,
            status: TransactionStatus.SUCCESS,
          },
        })
      ]);

      // Extract offer IDs from references to get car and seller details
      const offerIds = purchases
        .map(p => {
          const parts = p.reference.split('-');
          return parts.length > 1 ? parts[1] : null;
        })
        .filter((id): id is string => id !== null);

      const offers = await prisma.offer.findMany({
        where: { id: { in: offerIds } },
        include: {
          car: true,
          seller: {
            select: {
              firstName: true,
              lastName: true,
              sellerProfile: {
                select: {
                  companyName: true
                }
              }
            }
          }
        }
      });

      const formattedPurchases = purchases.map(purchase => {
        const offerId = purchase.reference.split('-')[1];
        const offer = offers.find(o => o.id === offerId);
        return {
          ...purchase,
          car: offer?.car || null,
          seller: offer?.seller ? {
            name: offer.seller.sellerProfile?.companyName || `${offer.seller.firstName} ${offer.seller.lastName}`
          } : null
        };
      });

      return res.json({
        data: formattedPurchases,
        pagination: {
          total,
          page: p,
          limit: l,
          totalPages: Math.ceil(total / l)
        }
      });
    }

    if (type === 'offers') {
      const [offers, total] = await Promise.all([
        prisma.offer.findMany({
          where: {
            buyerId: String(id),
          },
          include: {
            car: {
              include: {
                inspections: {
                  where: {
                    status: InspectionStatus.COMPLETED
                  },
                  include: {
                    report: true
                  },
                  orderBy: {
                    completedDate: 'desc'
                  },
                  take: 1
                }
              }
            },
            seller: {
              select: {
                firstName: true,
                lastName: true,
                sellerProfile: {
                  select: {
                    companyName: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: l,
        }),
        prisma.offer.count({
          where: {
            buyerId: String(id),
          },
        })
      ]);

      const formattedOffers = offers.map(offer => {
        const latestInspection = offer.car?.inspections?.[0];
        let calculatedScore = latestInspection?.score ?? null;

        // If score is missing but report is available, calculate it
        if (calculatedScore === null && latestInspection?.report) {
          const report = latestInspection.report;
          const scores = [
            report.exteriorScore,
            report.interiorScore,
            report.engineScore,
            report.suspensionScore,
            report.tiresScore,
            report.lightsScore
          ];
          calculatedScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        }

        const offerData = JSON.parse(JSON.stringify(offer));

        return {
          ...offerData,
          inspectionScore: calculatedScore,
          seller: {
            name: offer.seller?.sellerProfile?.companyName || `${offer.seller?.firstName} ${offer.seller?.lastName}`
          }
        };
      });

      return res.json({
        data: formattedOffers,
        pagination: {
          total,
          page: p,
          limit: l,
          totalPages: Math.ceil(total / l)
        }
      });
    }

    if (type === 'inspections') {
      const [inspections, total] = await Promise.all([
        prisma.inspection.findMany({
          where: {
            buyerId: String(id),
          },
          include: {
            report: true,
            car: {
              include: {
                seller: {
                  select: {
                    firstName: true,
                    lastName: true,
                    sellerProfile: {
                      select: {
                        companyName: true
                      }
                    }
                  }
                }
              }
            },
            inspector: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: l,
        }),
        prisma.inspection.count({
          where: {
            buyerId: String(id),
          },
        })
      ]);

      const formattedInspections = inspections.map(inspection => {
        let score = inspection.score;
        
        // If score is missing but report is available, calculate it
        if (score === null && inspection.report) {
          const report = inspection.report;
          const scores = [
            report.exteriorScore,
            report.interiorScore,
            report.engineScore,
            report.suspensionScore,
            report.tiresScore,
            report.lightsScore
          ];
          score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        }

        return {
          ...inspection,
          score,
          seller: inspection.car?.seller ? {
            name: inspection.car.seller.sellerProfile?.companyName || `${inspection.car.seller.firstName} ${inspection.car.seller.lastName}`
          } : null,
          inspectorName: inspection.inspector ? `${inspection.inspector.firstName} ${inspection.inspector.lastName}` : 'TBD'
        };
      });

      return res.json({
        data: formattedInspections,
        pagination: {
          total,
          page: p,
          limit: l,
          totalPages: Math.ceil(total / l)
        }
      });
    }

    res.status(400).json({ error: 'Invalid activity type' });
  } catch (error) {
    console.error('Error fetching buyer activities:', error);
    res.status(500).json({ error: 'Failed to fetch buyer activities' });
  }
};
