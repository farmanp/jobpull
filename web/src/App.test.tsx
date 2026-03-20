import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from './App';

// Mock the global fetch
global.fetch = vi.fn();

const mockJobs = [
  {
    id: '1',
    title: 'Senior PM',
    company: 'Acme',
    location: 'Remote',
    remote_status: 'remote',
    url: 'https://example.com/job1',
    pm_focus: 'growth',
    date_seen: '2025-01-01',
    tags: [],
    description: 'Build growth loop.'
  },
  {
    id: '2',
    title: 'Technical PM',
    company: 'Beta',
    location: 'New York',
    remote_status: 'hybrid',
    url: 'https://example.com/job2',
    pm_focus: 'technical',
    date_seen: '2025-01-02',
    tags: [],
    description: 'Manage API platform.'
  }
];

const mockMeta = {
  boardName: 'Test Board',
  tagline: 'Test tagline',
  remoteOnly: true,
  focusCategories: ['growth', 'technical'],
  claimed: true,
  visibility: 'public',
  viewerCanBrowse: true,
  viewerIsOwner: false
};

const mockViewer = {
  authenticated: false,
  isOwner: false,
  email: null,
  boardClaimed: true,
  boardVisibility: 'public',
  hasResume: false
};

const mockStats = {
  totalJobs: 42,
  visibleJobs: 40,
  staleJobs: 2,
  activeSources: 3,
  staleThresholdDays: 14,
  lastCrawl: { finishedAt: new Date().toISOString(), status: 'success', jobsAdded: 5 },
};

function createMockResponse(data: unknown) {
  return {
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(data)
  } as Response;
}

/**
 * Helper: mock fetch to return different data based on URL path.
 * /api/meta → mockMeta, /api/stats → mockStats, /api/jobs → { items: mockJobs }
 */
function mockFetchAll(overrides?: { jobs?: unknown; meta?: unknown; stats?: unknown; subscription?: unknown; me?: unknown }) {
  (global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/meta')) {
      return Promise.resolve(createMockResponse(overrides?.meta ?? mockMeta));
    }
    if (url.includes('/api/me')) {
      return Promise.resolve(createMockResponse(overrides?.me ?? mockViewer));
    }
    if (url.includes('/api/stats')) {
      return Promise.resolve(createMockResponse(overrides?.stats ?? mockStats));
    }
    if (url.includes('/api/subscriptions') && init?.method === 'POST') {
      return Promise.resolve(
        createMockResponse(
          overrides?.subscription ?? {
            ok: true,
            message: 'Check your inbox to confirm the daily digest subscription.'
          }
        )
      );
    }
    if (/\/api\/jobs\/[^/?]+$/.test(url)) {
      return Promise.resolve(createMockResponse(mockJobs[0]));
    }
    if (url.includes('/api/jobs')) {
      return Promise.resolve(createMockResponse(overrides?.jobs ?? { items: mockJobs }));
    }
    return Promise.resolve(createMockResponse({}));
  });
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (global.fetch as any).mockReturnValue(new Promise(() => {})); // pending promise
    render(<App />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders job list after fetch', async () => {
    mockFetchAll();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Senior PM')).toBeInTheDocument();
      expect(screen.getByText('Technical PM')).toBeInTheDocument();
    });

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('renders board name from /api/meta', async () => {
    mockFetchAll();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test Board')).toBeInTheDocument();
    });
  });

  it('renders stats bar from /api/stats', async () => {
    mockFetchAll();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('40 visible jobs')).toBeInTheDocument();
    });
  });

  it('updates filters and refetches', async () => {
    mockFetchAll();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Senior PM')).toBeInTheDocument();
    });

    // Change search input
    const searchInput = screen.getByPlaceholderText(/search title or company/i);
    fireEvent.change(searchInput, { target: { value: 'Acme' } });

    // Expect fetch to be called with query param
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('query=Acme'),
        expect.objectContaining({ credentials: 'include' })
      );
    });
  });

  it('clears filters after the user narrows the list', async () => {
    mockFetchAll();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Senior PM')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/search jobs/i), { target: { value: 'Acme' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/search jobs/i) as HTMLInputElement).value).toBe('');
    });
  });

  it('selects a job and shows details', async () => {
    mockFetchAll();

    render(<App />);

    await waitFor(() => screen.getByText('Senior PM'));

    fireEvent.click(screen.getByText('Senior PM'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/jobs/1'),
        expect.objectContaining({ credentials: 'include' })
      );
    });
    expect(screen.getByRole('heading', { name: 'Senior PM' })).toBeInTheDocument();
    expect(screen.getByText('Build growth loop.')).toBeInTheDocument();
  });

  it('renders descriptions as escaped text instead of HTML', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/meta')) {
        return Promise.resolve(createMockResponse(mockMeta));
      }
      if (url.includes('/api/me')) {
        return Promise.resolve(createMockResponse(mockViewer));
      }
      if (url.includes('/api/stats')) {
        return Promise.resolve(createMockResponse(mockStats));
      }
      if (/\/api\/jobs\/[^/?]+$/.test(url)) {
        return Promise.resolve(
          createMockResponse({
            ...mockJobs[0],
            description: '<strong>Build growth loop.</strong>'
          })
        );
      }
      if (url.includes('/api/jobs')) {
        return Promise.resolve(
          createMockResponse({
            items: [
              {
                ...mockJobs[0],
                description: undefined
              }
            ]
          })
        );
      }
      return Promise.resolve(createMockResponse({}));
    });

    const { container } = render(<App />);

    await waitFor(() => screen.getByText('Senior PM'));
    fireEvent.click(screen.getByText('Senior PM'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/jobs/1'),
        expect.objectContaining({ credentials: 'include' })
      );
    });
    expect(container.querySelector('.description strong')).toBeNull();
    expect(screen.getByText('<strong>Build growth loop.</strong>')).toBeInTheDocument();
  });

  it('handles API errors', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/meta')) {
        return Promise.resolve(createMockResponse(mockMeta));
      }
      if (url.includes('/api/me')) {
        return Promise.resolve(createMockResponse(mockViewer));
      }
      if (url.includes('/api/stats')) {
        return Promise.resolve(createMockResponse(mockStats));
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ error: 'Request failed: 500' })
      });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/request failed: 500/i)).toBeInTheDocument();
    });
  });

  it('shows an inline detail error when the full job fetch fails', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/meta')) {
        return Promise.resolve(createMockResponse(mockMeta));
      }
      if (url.includes('/api/me')) {
        return Promise.resolve(createMockResponse(mockViewer));
      }
      if (url.includes('/api/stats')) {
        return Promise.resolve(createMockResponse(mockStats));
      }
      if (/\/api\/jobs\/[^/?]+$/.test(url)) {
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ error: 'Request failed' })
        });
      }
      if (url.includes('/api/jobs')) {
        return Promise.resolve(
          createMockResponse({
            items: [{ ...mockJobs[0], description: undefined }]
          })
        );
      }
      return Promise.resolve(createMockResponse({}));
    });

    render(<App />);

    await waitFor(() => screen.getByText('Senior PM'));
    fireEvent.click(screen.getByText('Senior PM'));

    await waitFor(() => {
      expect(screen.getByText(/could not load full job details/i)).toBeInTheDocument();
    });
  });

  it('submits the public daily digest signup form', async () => {
    mockFetchAll();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Senior PM')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'reader@example.com' }
    });
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/subscriptions'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    expect(
      await screen.findByText(/check your inbox to confirm the daily digest subscription/i)
    ).toBeInTheDocument();
  });
});
