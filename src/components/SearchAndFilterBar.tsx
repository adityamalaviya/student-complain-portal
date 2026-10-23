'use client';

import React from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import type { ComplaintStatus } from '@/types';

export type FeedType = 'all' | 'department' | 'public';

interface SearchAndFilterBarProps {
  feedType: FeedType;
  onFeedTypeChange: (type: FeedType) => void;
  counts?: {
    all: number;
    department: number;
    public: number;
  };
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: ComplaintStatus | 'all';
  onStatusFilterChange: (status: ComplaintStatus | 'all') => void;
}

export function SearchAndFilterBar({
  feedType,
  onFeedTypeChange,
  counts = { all: 0, department: 0, public: 0 },
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: SearchAndFilterBarProps): React.ReactElement {
  return (
    <div className="mb-7 space-y-4">
      {/* Feed Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-px dark:border-slate-800">
        <nav className="flex items-center gap-6 sm:gap-8">
          <button
            type="button"
            onClick={() => onFeedTypeChange('all')}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition -mb-px ${
              feedType === 'all'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>All</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                feedType === 'all'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onFeedTypeChange('department')}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition -mb-px ${
              feedType === 'department'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>My Department</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                feedType === 'department'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {counts.department}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onFeedTypeChange('public')}
            className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition -mb-px ${
              feedType === 'public'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>Public Issues</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                feedType === 'public'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {counts.public}
            </span>
          </button>
        </nav>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col items-stretch gap-3 pt-1 sm:flex-row sm:items-center">
        {/* Search Input */}
        <div className="relative flex-1">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search complaints by title, location..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-9 text-xs text-slate-900 transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 focus:outline-none sm:text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs sm:pb-0">
          <button
            type="button"
            onClick={() => onStatusFilterChange('all')}
            className={`rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            All Statuses
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange('open')}
            className={`rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
              statusFilter === 'open'
                ? 'border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Pending
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange('in_progress')}
            className={`rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
              statusFilter === 'in_progress'
                ? 'border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            In Progress
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange('resolved')}
            className={`rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
              statusFilter === 'resolved'
                ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Resolved
          </button>
        </div>
      </div>
    </div>
  );
}
