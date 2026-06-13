import { Router } from "express";
import FeatureRequest from "../models/FeatureRequest.js";
import { authMiddleware, adminMiddleware } from "../middleware/security.js";

const router = Router();

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { sort = "votes", type = null, page = 1, limit = 20 } = req.query;
    const query = {};
    if (type) query.type = type;

    const sortOptions = {};
    if (sort === "newest") sortOptions.createdAt = -1;
    else if (sort === "trending") sortOptions.votes = -1;
    else sortOptions.votes = -1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [requests, total] = await Promise.all([
      FeatureRequest.find(query)
        .populate("userId", "name")
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      FeatureRequest.countDocuments(query)
    ]);

    const enriched = requests.map(r => {
      const userVote = r.voters?.find(v => v.userId?.toString() === req.user._id?.toString());
      return {
        ...r,
        userVote: userVote?.value || 0,
        voters: undefined
      };
    });

    res.json({ requests: enriched, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { type, title, description } = req.body;
    if (!type || !title || !description) {
      return res.status(400).json({ error: "Type, title, and description are required" });
    }

    const request = await FeatureRequest.create({
      userId: req.user._id,
      type,
      title: title.trim(),
      description: description.trim()
    });

    res.status(201).json({ request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/vote", authMiddleware, async (req, res) => {
  try {
    const { value } = req.body;
    if (![1, -1].includes(value)) {
      return res.status(400).json({ error: "Vote value must be 1 or -1" });
    }

    const request = await FeatureRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    const existingVoteIndex = request.voters.findIndex(
      v => v.userId.toString() === req.user._id.toString()
    );

    if (existingVoteIndex !== -1) {
      if (request.voters[existingVoteIndex].value === value) {
        request.voters.splice(existingVoteIndex, 1);
      } else {
        request.voters[existingVoteIndex].value = value;
      }
    } else {
      request.voters.push({ userId: req.user._id, value });
    }

    request.votes = request.voters.reduce((sum, v) => sum + v.value, 0);
    await request.save();

    const userVote = request.voters.find(
      v => v.userId.toString() === req.user._id.toString()
    );

    res.json({ votes: request.votes, userVote: userVote?.value || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/respond", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, adminResponse } = req.body;
    const validStatuses = ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "DECLINED"];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const update = {};
    if (status) update.status = status;
    if (adminResponse) {
      update.adminResponse = adminResponse;
      update.adminRespondedAt = new Date();
      update.adminRespondedBy = req.user._id;
    }

    const request = await FeatureRequest.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    res.json({ request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
