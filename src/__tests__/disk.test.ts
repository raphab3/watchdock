import { getDiskInfo } from '../utils/disk';
import * as os from 'os';
import { exec } from 'child_process';
import type { ExecException } from 'child_process';

jest.mock('os');
jest.mock('child_process');

type ExecCallback = (error: ExecException | null, stdout: string, stderr: string) => void;

jest.mock('util', () => ({
  promisify: (fn: any) => async (command: string) => {
    return new Promise((resolve) => {
      fn(command, (_error: Error | null, stdout: string, stderr: string) => {
        resolve({ stdout, stderr });
      });
    });
  },
}));

describe('getDiskInfo', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  describe('Windows Platform', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      (os.platform as jest.Mock).mockReturnValue('win32');
    });

    it('should parse Windows disk information correctly', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: any) => {
        callback(
          null,
          `Caption  FreeSpace    Size
  C:      104074125312 499037585408`,
          '',
        );
      });

      const result = await getDiskInfo();
      const expected = {
        total: 499037585408,
        free: 104074125312,
        used: 394963460096,
        // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
        usedPercentage: 79.14479667808323,
      };

      expect(result).toBeDefined();
      expect(result!.total).toBe(expected.total);
      expect(result!.free).toBe(expected.free);
      expect(result!.used).toBe(expected.used);
      expect(result!.usedPercentage).toBeCloseTo(expected.usedPercentage, 2);
    });

    it('should handle invalid Windows output format', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_: string, callback: ExecCallback) => {
        callback(null, 'Invalid Output', '');
      });

      const result = await getDiskInfo();

      expect(result).toEqual({
        total: 0,
        free: 0,
        used: 0,
        usedPercentage: 0,
      });
    });

    it('should handle empty Windows output', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_: string, callback: ExecCallback) => {
        callback(null, '', '');
      });

      const result = await getDiskInfo();

      expect(result).toEqual({
        total: 0,
        free: 0,
        used: 0,
        usedPercentage: 0,
      });
    });

    it('should handle Windows output with invalid numbers', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_: string, callback: ExecCallback) => {
        callback(
          null,
          `
Caption  FreeSpace    Size
C:      invalid     notanumber
`,
          '',
        );
      });

      const result = await getDiskInfo();

      expect(result).toEqual({
        total: 0,
        free: 0,
        used: 0,
        usedPercentage: 0,
      });
    });
  });

  describe('Unix Platform', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      Object.defineProperty(process, 'platform', { value: 'linux' });
      (os.platform as jest.Mock).mockReturnValue('linux');
    });

    it('should parse Unix disk information correctly', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: ExecCallback) => {
        const stdout = `Filesystem     1K-blocks      Used  Available Use% Mounted on
  /dev/sda1      244277768 187088784   44604220  81% /`;
        callback(null, stdout, '');
      });

      const result = await getDiskInfo();
      const expected = {
        total: 244277768 * 1024,
        used: 187088784 * 1024,
        free: 44604220 * 1024,
        usedPercentage: 81,
      };

      expect(result).toEqual(expected);
    });

    it('should handle custom path', async () => {
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: ExecCallback) => {
        const stdout = `Filesystem     1K-blocks    Used Available Use% Mounted on
  /dev/sdb1      488555536 366416652 122138884  75% /home`;
        callback(null, stdout, '');
      });

      const result = await getDiskInfo('/home');

      const expected = {
        total: 488555536 * 1024,
        used: 366416652 * 1024,
        free: (488555536 - 366416652) * 1024,
        usedPercentage: 75,
      };

      expect(result).toEqual(expected);
    });

    it('should handle errors', async () => {
      const mockError = new Error('Test error');
      // eslint-disable-next-line @typescript-eslint/ban-types
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: Function) => {
        callback(mockError, '', '');
      });

      const result = await getDiskInfo();
      expect(result).toEqual({
        total: 0,
        free: 0,
        used: 0,
        usedPercentage: 0,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle command execution errors', async () => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: Function) => {
        callback(new Error('Command failed'), { stdout: '' });
      });

      const result = await getDiskInfo();

      expect(result).toEqual({
        total: 0,
        free: 0,
        used: 0,
        usedPercentage: 0,
      });
    });

    it('should handle zero values', async () => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      (exec as unknown as jest.Mock).mockImplementation((_cmd: string, callback: Function) => {
        callback(null, {
          stdout: `Filesystem     1K-blocks      Used Available Use% Mounted on
/dev/sda1              0         0         0   0% /`,
        });
      });

      const result = await getDiskInfo();

      expect(result).toEqual({
        total: 0,
        free: 0,
        used: 0,
        usedPercentage: 0,
      });
    });
  });
});
