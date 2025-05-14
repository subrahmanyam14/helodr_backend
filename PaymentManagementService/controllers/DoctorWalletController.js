const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");

const getDoctorRevenue = async (req, res) => {
    try {
        const doctorId = req.user.doctorId; // Assuming JWT middleware attaches doctor info to req.user

        // Fetch doctor's wallet
        const wallet = await Wallet.findOne({ doctor: doctorId });
        if (!wallet) {
            return res.status(404).json({ message: "Wallet not found" });
        }

        // Total revenue till now
        const totalRevenue = wallet.total_earned;

        // Calculate revenue for last month
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const lastMonthTransactions = await Transaction.aggregate([
            {
                $match: {
                    user: doctorId,
                    type: "doctor_credit",
                    status: "completed",
                    createdAt: { $gte: oneMonthAgo }
                }
            },
            {
                $group: {
                    _id: null,
                    lastMonthRevenue: { $sum: "$amount" }
                }
            }
        ]);

        const lastMonthRevenue = lastMonthTransactions.length > 0
            ? lastMonthTransactions[0].lastMonthRevenue
            : 0;

        return res.status(200).json({
            totalRevenue,
            lastMonthRevenue
        });
    } catch (error) {
        console.error("Error fetching doctor revenue:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};



const getWalletSummary = async (req, res) => {
  try {
    const doctorId = req.user.doctorId; // Adjust this if your auth structure differs

    if (!doctorId) {
      return res.status(400).json({ error: "Doctor ID is required" });
    }

    // Get wallet
    const wallet = await Wallet.findOne({ doctor: doctorId });
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    // Calculate today's collection
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayCollection = await Transaction.aggregate([
      {
        $match: {
          user: doctorId,
          type: "doctor_credit",
          status: "completed",
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]);

    const dailyEarnings = todayCollection.length > 0 ? todayCollection[0].total : 0;

    res.status(200).json({
      success: true,
      data: {
        totalCoins: wallet.current_balance,
        dailyCollection: dailyEarnings
      }
    });

  } catch (error) {
    console.error("Error in getWalletSummary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


module.exports = {
    getDoctorRevenue,
    getWalletSummary
};
