import React, { useState, useEffect, useRef, useMemo } from "react";
import { FINA_AI_IMAGE, COMPANY_LOGO, COMPANY_NAME } from "../constants/branding";
import "./RealtimeDashboard.css";

export function RealtimeChart({ 
  data = [], 
  type = "line", 
  title, 
  subtitle,
  height = 200,
  colors = ["#54c3ff", "#00d67d"]
}) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });

  useEffect(() => {
    const container = canvasRef.current?.parentElement;
    if (container) {
      const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          setDimensions({
            width: entry.contentRect.width,
            height
          });
        }
      });
      resizeObserver.observe(container);
      return () => resizeObserver.disconnect();
    }
  }, [height]);

  useEffect(() => {
    if (!canvasRef.current || !data.length || dimensions.width === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    const maxValue = Math.max(...data.map(d => d.value), 1);
    const padding = 20;
    const chartWidth = dimensions.width - padding * 2;
    const chartHeight = dimensions.height - padding * 2;

    if (type === "line") {
      const gradient = ctx.createLinearGradient(0, 0, 0, dimensions.height);
      gradient.addColorStop(0, colors[0] + "40");
      gradient.addColorStop(1, colors[0] + "00");

      ctx.beginPath();
      ctx.moveTo(padding, dimensions.height - padding);
      
      data.forEach((point, i) => {
        const x = padding + (i / (data.length - 1)) * chartWidth;
        const y = padding + chartHeight - (point.value / maxValue) * chartHeight;
        if (i === 0) {
          ctx.lineTo(x, y);
        } else {
          const prevX = padding + ((i - 1) / (data.length - 1)) * chartWidth;
          const prevY = padding + chartHeight - (data[i - 1].value / maxValue) * chartHeight;
          const cpX = (prevX + x) / 2;
          ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
        }
      });

      ctx.lineTo(dimensions.width - padding, dimensions.height - padding);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      data.forEach((point, i) => {
        const x = padding + (i / (data.length - 1)) * chartWidth;
        const y = padding + chartHeight - (point.value / maxValue) * chartHeight;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevX = padding + ((i - 1) / (data.length - 1)) * chartWidth;
          const prevY = padding + chartHeight - (data[i - 1].value / maxValue) * chartHeight;
          const cpX = (prevX + x) / 2;
          ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
        }
      });
      ctx.strokeStyle = colors[0];
      ctx.lineWidth = 2;
      ctx.stroke();

      data.forEach((point, i) => {
        const x = padding + (i / (data.length - 1)) * chartWidth;
        const y = padding + chartHeight - (point.value / maxValue) * chartHeight;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = colors[0];
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = colors[0] + "30";
        ctx.fill();
      });
    } else if (type === "bar") {
      const barWidth = (chartWidth / data.length) * 0.7;
      const gap = (chartWidth / data.length) * 0.3;

      data.forEach((point, i) => {
        const x = padding + (i / data.length) * chartWidth + gap / 2;
        const barHeight = (point.value / maxValue) * chartHeight;
        const y = dimensions.height - padding - barHeight;

        const gradient = ctx.createLinearGradient(x, y, x, dimensions.height - padding);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, colors[0] + "60");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 4);
        ctx.fill();
      });
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "11px Manrope, sans-serif";
    ctx.textAlign = "center";

    data.forEach((point, i) => {
      const x = padding + (i / (data.length - 1)) * chartWidth;
      const label = point.label || "";
      if (label) {
        ctx.fillText(label, x, dimensions.height - 5);
      }
    });

  }, [data, type, dimensions, colors]);

  return (
    <div className="realtime-chart">
      {(title || subtitle) && (
        <div className="chart-header">
          {title && <h4>{title}</h4>}
          {subtitle && <span className="chart-subtitle">{subtitle}</span>}
        </div>
      )}
      <div className="chart-container">
        <canvas ref={canvasRef} style={{ width: dimensions.width, height: dimensions.height }} />
      </div>
    </div>
  );
}

export function RealtimeFeed({ items = [], type = "transactions", maxItems = 10 }) {
  const feedRef = useRef(null);
  const [displayedItems, setDisplayedItems] = useState(items.slice(0, maxItems));

  useEffect(() => {
    if (items.length > displayedItems.length) {
      const newItems = items.slice(0, maxItems);
      setDisplayedItems(newItems);
    }
  }, [items, maxItems]);

  const getItemIcon = (item) => {
    if (type === "transactions") {
      return item.direction === "incoming" ? "↓" : "↑";
    }
    if (type === "alerts") return "⚠️";
    if (type === "notifications") return "🔔";
    return "•";
  };

  const getItemColor = (item) => {
    if (type === "transactions") {
      return item.direction === "incoming" ? "success" : "primary";
    }
    if (type === "alerts") return item.severity === "high" ? "error" : "warning";
    return "default";
  };

  return (
    <div className="realtime-feed">
      {displayedItems.map((item, index) => (
        <div 
          key={item.id || index} 
          className={`feed-item ${getItemColor(item)} ${item.isNew ? "new" : ""}`}
        >
          <span className="feed-icon">{getItemIcon(item)}</span>
          <div className="feed-content">
            <span className="feed-title">{item.title}</span>
            <span className="feed-subtitle">{item.subtitle}</span>
          </div>
          <span className="feed-time">{item.time || "just now"}</span>
        </div>
      ))}
      {displayedItems.length === 0 && (
        <div className="feed-empty">
          <span>No recent activity</span>
        </div>
      )}
    </div>
  );
}

export function RealtimeNotifications({ notifications = [], onDismiss }) {
  const [visible, setVisible] = useState([]);

  useEffect(() => {
    const newNotifs = notifications.filter(n => !n.dismissed).slice(0, 5);
    setVisible(newNotifs);
  }, [notifications]);

  return (
    <div className="realtime-notifications">
      {visible.map((notif, index) => (
        <div 
          key={notif.id || index} 
          className={`notification ${notif.type} ${notif.isNew ? "slide-in" : ""}`}
        >
          <div className="notification-icon">
            {notif.type === "success" && "✓"}
            {notif.type === "warning" && "⚠️"}
            {notif.type === "error" && "✕"}
            {notif.type === "info" && "ℹ️"}
          </div>
          <div className="notification-content">
            <span className="notification-title">{notif.title}</span>
            {notif.message && <span className="notification-message">{notif.message}</span>}
          </div>
          <button 
            className="notification-dismiss"
            onClick={() => onDismiss?.(notif.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function StatCard({ 
  title, 
  value, 
  change, 
  changeLabel,
  icon,
  sparklineData,
  trend = "up"
}) {
  const isPositive = change >= 0;
  const trendColor = trend === "up" ? "#00d67d" : "#ff908b";

  return (
    <div className="stat-card">
      <div className="stat-header">
        {icon && <span className="stat-icon">{icon}</span>}
        <span className="stat-title">{title}</span>
      </div>
      <div className="stat-value">{value}</div>
      {change !== undefined && (
        <div className="stat-change" style={{ color: trendColor }}>
          <span className="change-arrow">{isPositive ? "↑" : "↓"}</span>
          <span className="change-value">{Math.abs(change)}%</span>
          {changeLabel && <span className="change-label">{changeLabel}</span>}
        </div>
      )}
      {sparklineData && sparklineData.length > 0 && (
        <div className="stat-sparkline">
          <RealtimeChart 
            data={sparklineData} 
            type="line" 
            height={40}
            colors={[trendColor]}
          />
        </div>
      )}
    </div>
  );
}

export function AIInsightCard({ insights = [], finaImage = FINA_AI_IMAGE, transactions = [], profile = null, onNavigate }) {
  const generatedInsights = useMemo(() => {
    const generated = [];
    if (transactions && transactions.length > 0) {
      const totalReceived = transactions
        .filter(t => t.direction === "incoming")
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      const totalSent = transactions
        .filter(t => t.direction === "outgoing")
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      const avgTx = transactions.length > 0 ? (totalReceived + totalSent) / transactions.length : 0;

      if (totalReceived > 0) {
        generated.push({
          icon: "📈",
          title: "Income Trend",
          description: `You've received ${totalReceived.toFixed(2)} XNO across ${transactions.filter(t => t.direction === "incoming").length} transactions.`,
          action: "View details",
          actionType: "history"
        });
      }
      if (totalSent > 0) {
        generated.push({
          icon: "📊",
          title: "Spending Pattern",
          description: `Average transaction: ${avgTx.toFixed(2)} XNO. Total sent: ${totalSent.toFixed(2)} XNO.`,
          action: "Analyze",
          actionType: "history"
        });
      }
      if (totalReceived > totalSent) {
        generated.push({
          icon: "💰",
          title: "Positive Balance",
          description: `Your income exceeds spending by ${(totalReceived - totalSent).toFixed(2)} XNO. Great job!`,
          action: "Set savings goal",
          actionType: "goals"
        });
      }
      if (transactions.length >= 5) {
        generated.push({
          icon: "🤖",
          title: "AI Recommendation",
          description: "Based on your activity, consider setting up automated savings for consistent growth.",
          action: "Learn more",
          actionType: "insights"
        });
      }
    } else {
      generated.push({
        icon: "👋",
        title: "Getting Started",
        description: "Start making transactions to receive personalized AI insights about your spending and savings.",
        action: "Send your first payment",
        actionType: "send"
      });
    }
    return generated;
  }, [transactions]);

  const displayInsights = insights.length > 0 ? insights : generatedInsights;

  const handleActionClick = (actionType) => {
    if (!onNavigate) return;
    if (actionType === "send") onNavigate("/send");
    else if (actionType === "history") onNavigate("/history");
    else if (actionType === "goals") window.dispatchEvent(new CustomEvent("open-goals"));
  };

  return (
    <div className="ai-insight-card">
      <div className="insight-header">
        <span className="insight-label">AI Insight</span>
        <img src={finaImage} alt="Fina" className="insight-fina-avatar" onClick={() => window.dispatchEvent(new CustomEvent("open-ai-assistant"))} style={{ cursor: "pointer" }} />
      </div>
      <div className="insights-list">
        {displayInsights.map((insight, index) => (
          <div key={index} className="insight-item">
            <span className="insight-icon">{insight.icon || "💡"}</span>
            <div className="insight-content">
              <span className="insight-title">{insight.title}</span>
              <span className="insight-description">{insight.description}</span>
              {insight.action && (
                <button className="insight-action" onClick={() => handleActionClick(insight.actionType)}>{insight.action}</button>
              )}
            </div>
          </div>
        ))}
        {displayInsights.length === 0 && (
          <div className="insight-empty">
            <span>No insights available</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function GoalProgress({ goals = [], onEdit, onDelete }) {
  return (
    <div className="goal-progress">
      {goals.map((goal, index) => {
        const progress = Math.min((goal.current / goal.target) * 100, 100);
        
        return (
          <div key={goal.id || index} className="goal-item">
            <div className="goal-header">
              <span className="goal-name">{goal.name}</span>
              <span className="goal-progress-text">
                {goal.current.toFixed(2)} / {goal.target.toFixed(2)} XNO
              </span>
            </div>
            <div className="goal-bar">
              <div 
                className="goal-fill" 
                style={{ 
                  width: `${progress}%`,
                  background: progress >= 100 ? "#00d67d" : "#54c3ff"
                }}
              />
            </div>
            <div className="goal-footer">
              <span className="goal-percentage">{progress.toFixed(0)}%</span>
              <div className="goal-actions">
                {onEdit && (
                  <button className="goal-action-btn edit-btn" onClick={() => onEdit(goal)}>
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button className="goal-action-btn delete-btn" onClick={() => onDelete(goal.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {goals.length === 0 && (
        <div className="goal-empty">
          <span>No goals set yet</span>
        </div>
      )}
    </div>
  );
}

export function SubscriptionStatus({ plan, status, usage = {}, onUpgrade }) {
  const planConfig = {
    free_trial: { name: "Free Trial", color: "#54c3ff" },
    edge: { name: "Edge", color: "#1e6be0" },
    prime: { name: "Prime", color: "#7c3aed" },
    apex: { name: "Apex", color: "#00d67d" }
  };

  const config = planConfig[plan] || planConfig.free_trial;
  
  // Determine if this is an active paid plan or active trial
  const isActivePlan = status === "active" && (plan !== "free_trial" || status === "active");
  const isActiveFreeTrial = plan === "free_trial" && status === "active";
  const isActiveSubscription = isActivePlan || isActiveFreeTrial;

  return (
    <div className="subscription-status">
      <div className="subscription-header">
        <span className="subscription-plan" style={{ color: config.color }}>
          {config.name} Plan {isActiveSubscription ? "(Active)" : ""}
        </span>
        {!isActiveSubscription && (
          <button className="upgrade-button" onClick={onUpgrade}>
            Upgrade
          </button>
        )}
        {isActiveSubscription && (
          <span className="plan-status-badge" style={{ color: config.color }}>
            Active
          </span>
        )}
      </div>
      {usage.fxLimit > 0 && (
        <div className="usage-bar">
          <div className="usage-label">
            <span>FX Used</span>
            <span>{usage.fxUsed || 0} / {usage.fxLimit} XNO</span>
          </div>
          <div className="usage-track">
            <div 
              className="usage-fill"
              style={{ width: `${Math.min(((usage.fxUsed || 0) / usage.fxLimit) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default {
  RealtimeChart,
  RealtimeFeed,
  RealtimeNotifications,
  StatCard,
  AIInsightCard,
  GoalProgress,
  SubscriptionStatus
};