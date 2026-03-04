/**
 * Tool Usage Analytics
 * Tracks which tools are used most frequently for optimization insights
 */

export interface ToolUsageStats {
  toolName: string;
  callCount: number;
  successCount: number;
  errorCount: number;
  totalDuration: number;
  avgDuration: number;
  lastUsed: Date;
  firstUsed: Date;
}

export class ToolAnalytics {
  private stats: Map<string, ToolUsageStats> = new Map();
  private readonly maxEntries = 1000; // Prevent unbounded growth

  /**
   * Record a tool execution
   */
  recordExecution(toolName: string, durationMs: number, success: boolean) {
    let stat = this.stats.get(toolName);

    if (!stat) {
      stat = {
        toolName,
        callCount: 0,
        successCount: 0,
        errorCount: 0,
        totalDuration: 0,
        avgDuration: 0,
        lastUsed: new Date(),
        firstUsed: new Date()
      };
      this.stats.set(toolName, stat);
    }

    // Update stats
    stat.callCount++;
    stat.totalDuration += durationMs;
    stat.avgDuration = stat.totalDuration / stat.callCount;
    stat.lastUsed = new Date();

    if (success) {
      stat.successCount++;
    } else {
      stat.errorCount++;
    }

    // Prevent memory leak - remove least recently used if too many entries
    if (this.stats.size > this.maxEntries) {
      this.pruneOldEntries();
    }
  }

  /**
   * Get stats for a specific tool
   */
  getToolStats(toolName: string): ToolUsageStats | null {
    return this.stats.get(toolName) || null;
  }

  /**
   * Get top N most used tools
   */
  getTopTools(limit: number = 10): ToolUsageStats[] {
    return Array.from(this.stats.values())
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, limit);
  }

  /**
   * Get tools with highest error rates
   */
  getProblemTools(minCalls: number = 5, limit: number = 10): ToolUsageStats[] {
    return Array.from(this.stats.values())
      .filter(s => s.callCount >= minCalls)
      .sort((a, b) => {
        const aErrorRate = a.errorCount / a.callCount;
        const bErrorRate = b.errorCount / b.callCount;
        return bErrorRate - aErrorRate;
      })
      .slice(0, limit);
  }

  /**
   * Get slowest tools
   */
  getSlowestTools(limit: number = 10): ToolUsageStats[] {
    return Array.from(this.stats.values())
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);
  }

  /**
   * Get tools not used recently
   */
  getStaleTools(daysSinceUse: number = 7): ToolUsageStats[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysSinceUse);

    return Array.from(this.stats.values())
      .filter(s => s.lastUsed < cutoff)
      .sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime());
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const allStats = Array.from(this.stats.values());

    if (allStats.length === 0) {
      return {
        totalTools: 0,
        totalCalls: 0,
        totalSuccesses: 0,
        totalErrors: 0,
        overallSuccessRate: 0,
        avgDuration: 0
      };
    }

    const totalCalls = allStats.reduce((sum, s) => sum + s.callCount, 0);
    const totalSuccesses = allStats.reduce((sum, s) => sum + s.successCount, 0);
    const totalErrors = allStats.reduce((sum, s) => sum + s.errorCount, 0);
    const totalDuration = allStats.reduce((sum, s) => sum + s.totalDuration, 0);

    return {
      totalTools: allStats.length,
      totalCalls,
      totalSuccesses,
      totalErrors,
      overallSuccessRate: totalCalls > 0 ? (totalSuccesses / totalCalls) * 100 : 0,
      avgDuration: totalCalls > 0 ? totalDuration / totalCalls : 0
    };
  }

  /**
   * Get all statistics (for export/reporting)
   */
  getAllStats(): ToolUsageStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Clear all statistics
   */
  clear() {
    this.stats.clear();
  }

  /**
   * Prune old entries to prevent memory leak
   */
  private pruneOldEntries() {
    // Keep only the most recently used 800 entries (80% of max)
    const entries = Array.from(this.stats.entries())
      .sort((a, b) => b[1].lastUsed.getTime() - a[1].lastUsed.getTime())
      .slice(0, Math.floor(this.maxEntries * 0.8));

    this.stats = new Map(entries);
  }

  /**
   * Export analytics to JSON
   */
  exportToJson(): string {
    const data = {
      summary: this.getSummary(),
      topTools: this.getTopTools(20),
      problemTools: this.getProblemTools(),
      slowestTools: this.getSlowestTools(),
      staleTools: this.getStaleTools(),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(data, null, 2);
  }
}

// Singleton instance
export const toolAnalytics = new ToolAnalytics();
