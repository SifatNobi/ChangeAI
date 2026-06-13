import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  value: { type: Number, enum: [1, -1], required: true }
}, { _id: false });

const featureRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['FEATURE_REQUEST', 'FEATURE_REMOVAL', 'BUG_REPORT', 'SUGGESTION'],
    required: true
  },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  votes: { type: Number, default: 0 },
  voters: [voteSchema],
  status: {
    type: String,
    enum: ['NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED'],
    default: 'NEW'
  },
  adminResponse: { type: String, trim: true, maxlength: 1000 },
  adminRespondedAt: Date,
  adminRespondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

featureRequestSchema.add({
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

featureRequestSchema.index({ votes: -1 });
featureRequestSchema.index({ createdAt: -1 });
featureRequestSchema.index({ status: 1 });
featureRequestSchema.index({ isDeleted: 1 });

export default mongoose.model('FeatureRequest', featureRequestSchema);
