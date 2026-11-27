'use client';

import React from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import type { ComplaintStatus } from '@/types';

export type FeedType = 'all' | 'mine';

interface SearchAndFilterBarProps {
  feedType: FeedType;
  onFeedTypeChange: (type: FeedType) => void;
  counts?: {
    all: number;
    mine: number;
  };
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: ComplaintStatus | 'all';
  onStatusFilterChange: (status: ComplaintStatus | 'all') => void;
}

export function SearchAndFilterBar({
  feedType,
  onFeedTypeChange,
  counts = { all: 0, mine: 0 },
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: SearchAndFilterBarProps): React.ReactElement {
  return (
    <div className="mb-7 space-y-4">
      {/* Feed Tabs (Academic Department Scoped Only) */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-px dark:border-slate-800">
        <nav className="flex flex-wrap items-center gap-4 sm:gap-8">
          <button
            type="button"
            onClick={() => onFeedTypeChange('all')}
            className={`-mb-px flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition ${
              feedType === 'all'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>Department Feed</span>
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
            onClick={() => onFeedTypeChange('mine')}
            className={`-mb-px flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold transition ${
              feedType === 'mine'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>My Submissions</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                feedType === 'mine'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {counts.mine}
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
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search complaints by title, location..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-9 pl-10 text-xs text-slate-900 transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 focus:outline-none sm:text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
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
            onClick={() => onStatusFilterChange('Pending')}
            className={`rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
              statusFilter === 'Pending' || statusFilter === 'open'
                ? 'border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Pending
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange('In Progress')}
            className={`rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
              statusFilter === 'In Progress' || statusFilter === 'in_progress'
                ? 'border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            In Progress
          </button>

          <button
            type="button"
            onClick={() => onStatusFilterChange('Resolved')}
            className={`rounded-lg px-3 py-1.5 font-medium whitespace-nowrap transition ${
              statusFilter === 'Resolved' || statusFilter === 'resolved'
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
