import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  getFeatureRequests,
  createFeatureRequest,
  voteFeatureRequest,
  deleteFeatureRequest,
  restoreFeatureRequest
} from "../api";
import "./FeatureRequestCenter.css";

const TYPE_LABELS = {
  FEATURE_REQUEST: { label: "Feature Request", icon: "✨", color: "#54c3ff" },
  FEATURE_REMOVAL: { label: "Remove Feature", icon: "🗑️", color: "#f87171" },
  BUG_REPORT: { label: "Bug Report", icon: "🐛", color: "#fb923c" },
  SUGGESTION: { label: "Suggestion", icon: "💡", color: "#a78bfa" }
};

const STATUS_LABELS = {
  NEW: { label: "New", color: "#6b7280", bg: "rgba(107,114,128,0.15)" },
  UNDER_REVIEW: { label: "Under Review", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  PLANNED: { label: "Planned", color: "#54c3ff", bg: "rgba(84,195,255,0.15)" },
  IN_PROGRESS: { label: "In Progress", color: "#8b5cf6", bg: "rgba(139,92,246,0.15)" },
  COMPLETED: { label: "Completed", color: "#00c896", bg: "rgba(0,200,150,0.15)" },
  DECLINED: { label: "Declined", color: "#ef4444", bg: "rgba(239,68,68,0.15)" }
};

const SORT_OPTIONS = [
  { value: "votes", label: "🔥 Most Requested" },
  { value: "newest", label: "🕐 Newest" },
  { value: "trending", label: "📈 Trending" }
];

const TYPE_FILTERS = [
  { value: "", label: "All Types" },
  { value: "FEATURE_REQUEST", label: "✨ Feature Requests" },
  { value: "BUG_REPORT", label: "🐛 Bug Reports" },
  { value: "SUGGESTION", label: "💡 Suggestions" },
  { value: "FEATURE_REMOVAL", label: "🗑️ Removals" }
];

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || STATUS_LABELS.NEW;
  return (
    <span className="fr-status-badge" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

function TypeBadge({ type }) {
  const t = TYPE_LABELS[type] || { label: type, icon: "📋", color: "#6b7280" };
  return (
    <span className="fr-type-badge" style={{ color: t.color, borderColor: t.color + "44" }}>
      {t.icon} {t.label}
    </span>
  );
}

function RequestCard({ request, token, currentUserId, currentUserRole, onVote, onDelete, onRestore }) {
  const [voting, setVoting] = useState(false);
  const [localVotes, setLocalVotes] = useState(request.votes || 0);
  const [userVote, setUserVote] = useState(request.userVote || 0);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const canDelete = useMemo(() => {
    if (!currentUserId) return false;
    return request.userId?._id === currentUserId || currentUserRole === "admin";
  }, [currentUserId, currentUserRole, request.userId]);

  const handleVote = useCallback(async (value) => {
    if (!token || voting) return;
    setVoting(true);
    try {
      const result = await voteFeatureRequest(token, request._id, value);
      setLocalVotes(result.votes);
      setUserVote(result.userVote);
      onVote?.(request._id, result.votes, result.userVote);
    } catch (err) {
      console.error("Vote failed:", err);
    } finally {
      setVoting(false);
    }
  }, [token, request._id, voting, onVote]);

  const handleDelete = useCallback(async () => {
    if (!token || deleting) return;
    setDeleting(true);
    try {
      await deleteFeatureRequest(token, request._id);
      onDelete?.(request._id);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
    }
  }, [token, request._id, deleting, onDelete]);

  const handleRestore = useCallback(async () => {
    if (!token || restoring) return;
    setRestoring(true);
    try {
      await restoreFeatureRequest(token, request._id);
      onRestore?.(request._id);
    } catch (err) {
      console.error("Restore failed:", err);
    } finally {
      setRestoring(false);
    }
  }, [token, request._id, restoring, onRestore]);

  const timeSince = useMemo(() => {
    if (!request.createdAt) return "";
    const diff = Date.now() - new Date(request.createdAt).getTime();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor(diff / 60000);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
  }, [request.createdAt]);

  return (
    <div className="fr-card glass-card">
      <div className="fr-card-header">
        <div className="fr-card-meta">
          <TypeBadge type={request.type} />
          <StatusBadge status={request.status} />
          <span className="fr-time">{timeSince}</span>
        </div>
        <div className="fr-vote-group">
          <button
            className={`fr-vote-btn fr-vote-up ${userVote === 1 ? "active" : ""}`}
            onClick={() => handleVote(1)}
            disabled={voting}
            aria-label="Upvote"
            title="Upvote"
          >
            👍
          </button>
          <span className="fr-vote-count" style={{ color: localVotes > 0 ? "#00c896" : localVotes < 0 ? "#ef4444" : "inherit" }}>
            {localVotes > 0 ? "+" : ""}{localVotes}
          </span>
          <button
            className={`fr-vote-btn fr-vote-down ${userVote === -1 ? "active" : ""}`}
            onClick={() => handleVote(-1)}
            disabled={voting}
            aria-label="Downvote"
            title="Downvote"
          >
            👎
          </button>
        </div>
      </div>

      <h3 className="fr-card-title">{request.title}</h3>
      <p className="fr-card-description">{request.description}</p>

      {request.userId?.name && (
        <div className="fr-card-author">by {request.userId.name}</div>
      )}

      {request.adminResponse && (
        <div className="fr-admin-response">
          <span className="fr-admin-response-label">🛡️ Admin Response</span>
          <p>{request.adminResponse}</p>
        </div>
      )}

      {canDelete && (
        <div className="fr-card-actions">
          <button
            className="ghost-button fr-delete-btn"
            onClick={handleDelete}
            disabled={deleting}
            title="Delete request"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      )}

      {request.isDeleted && canDelete && (
        <div className="fr-card-actions">
          <button
            className="ghost-button fr-restore-btn"
            onClick={handleRestore}
            disabled={restoring}
            title="Restore request"
          >
            {restoring ? "Restoring..." : "Restore"}
          </button>
        </div>
      )}
    </div>
  );
}

function SubmitForm({ token, onSubmitted, onClose }) {
  const [form, setForm] = useState({ type: "FEATURE_REQUEST", title: "", description: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createFeatureRequest(token, form);
      setSuccess(true);
      setTimeout(() => {
        onSubmitted?.();
        onClose?.();
      }, 1500);
    } catch (err) {
      setError(err.message || "Failed to submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fr-submit-success">
        <div className="fr-success-icon">✅</div>
        <h3>Submitted Successfully!</h3>
        <p>Your request has been submitted to our team. Thank you for helping improve ChangeAIPay!</p>
      </div>
    );
  }

  return (
    <form className="fr-submit-form" onSubmit={handleSubmit} noValidate>
      <h3 className="fr-submit-title">Submit a Request</h3>

      <div className="fr-type-grid">
        {Object.entries(TYPE_LABELS).map(([value, { label, icon, color }]) => (
          <label
            key={value}
            className={`fr-type-option ${form.type === value ? "selected" : ""}`}
            style={form.type === value ? { borderColor: color, background: color + "15" } : {}}
          >
            <input type="radio" name="type" value={value} checked={form.type === value} onChange={handleChange} />
            <span className="fr-type-icon">{icon}</span>
            <span className="fr-type-label">{label}</span>
          </label>
        ))}
      </div>

      <input
        type="text"
        name="title"
        placeholder="Short, descriptive title..."
        value={form.title}
        onChange={handleChange}
        maxLength={200}
        required
        aria-label="Request title"
      />

      <textarea
        name="description"
        placeholder="Describe your request in detail. What problem does it solve? What should it do?"
        value={form.description}
        onChange={handleChange}
        maxLength={2000}
        rows={5}
        required
        aria-label="Request description"
      />

      <div className="fr-char-count">{form.description.length}/2000</div>

      {error && <div className="fr-error">{error}</div>}

      <div className="fr-submit-actions">
        <button type="button" className="ghost-button" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </form>
  );
}

export default function FeatureRequestCenter({ token, profile }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("votes");
  const [typeFilter, setTypeFilter] = useState("");
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const currentUserId = profile?.user?.id || profile?.id || profile?._id;
  const currentUserRole = profile?.role || profile?.user?.role;

  const fetchRequests = useCallback(async (currentSort = sort, currentType = typeFilter, currentPage = page) => {
    setLoading(true);
    setError("");
    try {
      const data = await getFeatureRequests(token, {
        sort: currentSort,
        type: currentType || null,
        page: currentPage
      });
      setRequests(data.requests || []);
      setTotal(data.total || 0);
      setTotalPages(data.pages || 1);
    } catch (err) {
      setError(err.message || "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }, [token, sort, typeFilter, page]);

  useEffect(() => {
    fetchRequests(sort, typeFilter, page);
  }, [sort, typeFilter, page]);

  const handleSortChange = (newSort) => {
    setSort(newSort);
    setPage(1);
  };

  const handleTypeChange = (newType) => {
    setTypeFilter(newType);
    setPage(1);
  };

  const handleVote = useCallback((id, votes, userVote) => {
    setRequests(prev => prev.map(r => r._id === id ? { ...r, votes, userVote } : r));
  }, []);

  const handleDelete = useCallback((id) => {
    setRequests(prev => prev.filter(r => r._id !== id));
    setTotal(prev => Math.max(0, prev - 1));
  }, []);

  const handleRestore = useCallback((id) => {
    setRequests(prev => prev.map(r => r._id === id ? { ...r, isDeleted: false, deletedAt: null, deletedBy: null } : r));
  }, []);

  return (
    <div className="feature-request-center">
      <div className="fr-header">
        <div className="fr-header-text">
          <h1 className="fr-title">💡 Feature Request Center</h1>
          <p className="fr-subtitle">
            Shape the future of ChangeAIPay. Submit ideas, report bugs, vote on what matters most.
          </p>
          <div className="fr-stats">
            <span className="fr-stat">{total} total requests</span>
          </div>
        </div>
        <button
          className="primary-button fr-submit-btn"
          onClick={() => setShowSubmitForm(true)}
          id="fr-submit-btn"
        >
          + Submit Request
        </button>
      </div>

      {showSubmitForm && (
        <div className="fr-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowSubmitForm(false)}>
          <div className="fr-modal">
            <SubmitForm
              token={token}
              onSubmitted={() => fetchRequests(sort, typeFilter, 1)}
              onClose={() => setShowSubmitForm(false)}
            />
          </div>
        </div>
      )}

      <div className="fr-controls">
        <div className="fr-sort-tabs">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`fr-sort-btn ${sort === opt.value ? "active" : ""}`}
              onClick={() => handleSortChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="fr-type-filter">
          <select
            value={typeFilter}
            onChange={e => handleTypeChange(e.target.value)}
            aria-label="Filter by type"
          >
            {TYPE_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="fr-loading">
          <div className="fr-spinner" />
          <p>Loading requests...</p>
        </div>
      ) : error ? (
        <div className="fr-error-state">
          <p>{error}</p>
          <button className="ghost-button" onClick={() => fetchRequests()}>Retry</button>
        </div>
      ) : requests.length === 0 ? (
        <div className="fr-empty">
          <div className="fr-empty-icon">💬</div>
          <h3>No requests yet</h3>
          <p>Be the first to submit a feature request or suggestion!</p>
          <button className="primary-button" onClick={() => setShowSubmitForm(true)}>
            Submit First Request
          </button>
        </div>
      ) : (
        <>
          <div className="fr-list">
            {requests.map(request => (
              <RequestCard
                key={request._id}
                request={request}
                token={token}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                onVote={handleVote}
                onDelete={handleDelete}
                onRestore={handleRestore}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="fr-pagination">
              <button
                className="ghost-button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Previous
              </button>
              <span className="fr-page-info">Page {page} of {totalPages}</span>
              <button
                className="ghost-button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
