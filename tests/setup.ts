// Jest setup file
import { TextEncoder, TextDecoder } from 'util';

// Add TextEncoder/TextDecoder to global for Node < 20
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Suppress console output during tests unless explicitly needed
if (process.env.NODE_ENV === 'test' && !process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
}

// Add custom matchers
expect.extend({
  toContainIssue(received: any[], issueType: string) {
    const pass = received.some(issue => issue.type === issueType);
    if (pass) {
      return {
        message: () => `expected issues not to contain type "${issueType}"`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected issues to contain type "${issueType}"`,
        pass: false,
      };
    }
  },
});