import { HttpException, HttpStatus } from '@nestjs/common';

import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { EventStoreService } from '../src/monitoring/event-store.service';

describe('HttpExceptionFilter', () => {
  let store: EventStoreService;
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    store = new EventStoreService();
    filter = new HttpExceptionFilter(store);
  });

  function mockHost(req: { method?: string; url?: string; requestId?: string }) {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const response = { headersSent: false, status, json };

    const request = {
      method: req.method ?? 'GET',
      url: req.url ?? '/test',
      requestId: req.requestId,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      json,
      status,
    };
  }

  it('returns structured JSON with requestId', () => {
    const host = mockHost({ requestId: 'rid-1' });
    filter.catch(new HttpException('nope', HttpStatus.BAD_REQUEST), host as never);

    expect(host.status).toHaveBeenCalledWith(400);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'nope',
        requestId: 'rid-1',
      }),
    );
  });

  it('records 5xx errors in the event store', () => {
    const host = mockHost({ requestId: 'rid-2' });
    filter.catch(new Error('boom'), host as never);

    expect(host.status).toHaveBeenCalledWith(500);
    const events = store.listRecent({ level: 'error' });
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('boom');
    expect(events[0].context).toMatchObject({ requestId: 'rid-2' });
  });

  it('does not record routine 4xx errors', () => {
    const host = mockHost({});
    filter.catch(new HttpException('Forbidden', HttpStatus.FORBIDDEN), host as never);

    expect(store.listRecent()).toHaveLength(0);
  });
});
