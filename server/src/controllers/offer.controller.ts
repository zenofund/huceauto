import { Request, Response } from 'express';
import { PrismaClient, OfferStatus } from '@prisma/client';
import { createNotification } from './notification.controller';

const prisma = new PrismaClient();

export const getSellerOffers = async (req: any, res: Response) => {
  try {
    const { userId } = req.user;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where: { sellerId: userId },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true
            }
          },
          car: {
            select: {
              id: true,
              title: true,
              make: true,
              model: true,
              year: true,
              price: true,
              images: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.offer.count({
        where: { sellerId: userId }
      })
    ]);

    const formattedOffers = offers.map(offer => ({
      id: offer.id,
      buyerName: `${offer.buyer.firstName} ${offer.buyer.lastName}`,
      amount: offer.amount.toString(),
      status: offer.status,
      carDetails: `${offer.car.make} ${offer.car.model} ${offer.car.year}`,
      carId: offer.carId,
      createdAt: offer.createdAt
    }));

    res.json({
      offers: formattedOffers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching seller offers:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
};

export const getOffersByCarId = async (req: any, res: Response) => {
  try {
    const { carId } = req.params;
    const { userId } = req.user;

    // Verify car ownership
    const car = await prisma.car.findUnique({
      where: { id: carId },
      select: { sellerId: true }
    });

    if (!car || car.sellerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to view offers for this car' });
    }

    const offers = await prisma.offer.findMany({
      where: { carId },
      include: {
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(offers);
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
};

export const counterOffer = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    const { userId } = req.user;

    const offer = await prisma.offer.findUnique({
      where: { id }
    });

    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    if (offer.sellerId !== userId) {
      return res.status(403).json({ error: 'Only the seller can counter an offer' });
    }

    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: { 
        amount: parseFloat(amount.toString().replace(/[^0-9.]/g, '')),
        status: OfferStatus.COUNTERED,
        updatedAt: new Date()
      },
      include: {
        car: true,
        seller: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    // Notify buyer about counter offer
    await createNotification(offer.buyerId, {
      title: 'New Counter Offer',
      message: `${updatedOffer.seller.firstName} ${updatedOffer.seller.lastName} sent a counter offer of ₦${amount.toLocaleString()} for ${updatedOffer.car.year} ${updatedOffer.car.make} ${updatedOffer.car.model}`,
      type: 'OFFER',
      link: '/buyer-dashboard?tab=offers'
    });

    res.json(updatedOffer);
  } catch (error) {
    console.error('Error countering offer:', error);
    res.status(500).json({ error: 'Failed to counter offer' });
  }
};

export const acceptOffer = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const offer = await prisma.offer.findUnique({
      where: { id }
    });

    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    // If it's PENDING, only seller can accept
    // If it's COUNTERED, only buyer can accept
    if (offer.status === OfferStatus.PENDING) {
      if (offer.sellerId !== userId) {
        return res.status(403).json({ error: 'Only the seller can accept this offer' });
      }
    } else if (offer.status === OfferStatus.COUNTERED) {
      if (offer.buyerId !== userId) {
        return res.status(403).json({ error: 'Only the buyer can accept this counter offer' });
      }
    } else {
      return res.status(400).json({ error: 'Offer cannot be accepted in its current status' });
    }

    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: { 
        status: OfferStatus.ACCEPTED,
        updatedAt: new Date()
      },
      include: {
        car: true,
        buyer: {
          select: { firstName: true, lastName: true }
        },
        seller: {
          select: { firstName: true, lastName: true }
        }
      }
    });

    // Notify the other party
    if (offer.status === OfferStatus.PENDING) {
      // Seller accepted buyer's offer
      await createNotification(offer.buyerId, {
        title: 'Offer Accepted',
        message: `${updatedOffer.seller.firstName} ${updatedOffer.seller.lastName} accepted your offer for ${updatedOffer.car.year} ${updatedOffer.car.make} ${updatedOffer.car.model}. You can now proceed to payment.`,
        type: 'OFFER',
        link: '/buyer-dashboard?tab=offers'
      });
    } else if (offer.status === OfferStatus.COUNTERED) {
      // Buyer accepted seller's counter offer
      await createNotification(offer.sellerId, {
        title: 'Counter Offer Accepted',
        message: `${updatedOffer.buyer.firstName} ${updatedOffer.buyer.lastName} accepted your counter offer for ${updatedOffer.car.year} ${updatedOffer.car.make} ${updatedOffer.car.model}.`,
        type: 'OFFER',
        link: '/seller-dashboard?tab=offers'
      });
    }

    res.json(updatedOffer);
  } catch (error) {
    console.error('Error accepting offer:', error);
    res.status(500).json({ error: 'Failed to accept offer' });
  }
};

export const createOffer = async (req: any, res: Response) => {
  try {
    const { carId, amount } = req.body;
    const { userId } = req.user;

    // Get car to find sellerId
    const car = await prisma.car.findUnique({
      where: { id: carId },
      select: { sellerId: true, price: true }
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    // Check if buyer is trying to offer on their own car
    if (car.sellerId === userId) {
      return res.status(400).json({ error: 'You cannot make an offer on your own car' });
    }

    // Check if an offer already exists for this car by this buyer
    const existingOffer = await prisma.offer.findFirst({
      where: {
        carId,
        buyerId: userId,
        status: {
          in: [OfferStatus.PENDING, OfferStatus.ACCEPTED]
        }
      }
    });

    if (existingOffer) {
      return res.status(400).json({ error: 'You already have an active offer for this car' });
    }

    const offer = await prisma.offer.create({
      data: {
        carId,
        buyerId: userId,
        sellerId: car.sellerId,
        amount: parseFloat(amount.replace(/[^0-9.]/g, '')),
        status: OfferStatus.PENDING
      },
      include: {
        car: true,
        buyer: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Notify seller about new offer
    await createNotification(car.sellerId, {
      title: 'New Offer Received',
      message: `${offer.buyer.firstName} ${offer.buyer.lastName} made an offer of ₦${offer.amount.toLocaleString()} for your ${offer.car.year} ${offer.car.make} ${offer.car.model}`,
      type: 'OFFER',
      link: `/seller-dashboard?tab=offers`
    });

    res.status(201).json(offer);
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({ error: 'Failed to create offer' });
  }
};

export const rejectOffer = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const offer = await prisma.offer.findUnique({
      where: { id },
      include: { car: true }
    });

    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    // Only buyer can decline a seller's counter or accepted offer?
    // Actually, usually seller rejects buyer's offer.
    // User said: "buyer can decline sellers offer"
    
    if (offer.buyerId !== userId && offer.sellerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: { 
        status: OfferStatus.REJECTED,
        updatedAt: new Date()
      },
      include: {
        car: true,
        buyer: { select: { firstName: true, lastName: true } },
        seller: { select: { firstName: true, lastName: true } }
      }
    });

    // Notify the other party
    if (userId === offer.sellerId) {
      // Seller rejected buyer's offer
      await createNotification(offer.buyerId, {
        title: 'Offer Rejected',
        message: `Your offer for ${updatedOffer.car.year} ${updatedOffer.car.make} ${updatedOffer.car.model} has been rejected.`,
        type: 'OFFER',
        link: '/buyer-dashboard?tab=offers'
      });
    } else {
      // Buyer rejected seller's counter offer
      await createNotification(offer.sellerId, {
        title: 'Counter Offer Rejected',
        message: `Your counter offer for ${updatedOffer.car.year} ${updatedOffer.car.make} ${updatedOffer.car.model} was rejected by the buyer.`,
        type: 'OFFER',
        link: '/seller-dashboard?tab=offers'
      });
    }

    res.json(updatedOffer);
  } catch (error) {
    console.error('Error rejecting offer:', error);
    res.status(500).json({ error: 'Failed to reject offer' });
  }
};

export const cancelOffer = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const offer = await prisma.offer.findUnique({
      where: { id }
    });

    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    if (offer.buyerId !== userId) {
      return res.status(403).json({ error: 'Only the buyer can cancel their offer' });
    }

    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: { 
        status: OfferStatus.CANCELLED,
        updatedAt: new Date()
      },
      include: {
        car: true,
        buyer: { select: { firstName: true, lastName: true } }
      }
    });

    // Notify seller about cancellation
    await createNotification(offer.sellerId, {
      title: 'Offer Cancelled',
      message: `${updatedOffer.buyer.firstName} ${updatedOffer.buyer.lastName} cancelled their offer for ${updatedOffer.car.year} ${updatedOffer.car.make} ${updatedOffer.car.model}.`,
      type: 'OFFER',
      link: '/seller-dashboard?tab=offers'
    });

    res.json(updatedOffer);
  } catch (error) {
    console.error('Error cancelling offer:', error);
    res.status(500).json({ error: 'Failed to cancel offer' });
  }
};
