import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DiskInfo } from '../types';

const execAsync = promisify(exec);

export async function getDiskInfo(path: string = '/'): Promise<DiskInfo> {
  try {
    if (os.platform() === 'win32') {
      const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
      const lines = stdout.trim().split('\n').slice(1);

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const caption = parts[0];
          const freeSpace = parts[1];
          const size = parts[2];

          if (caption && freeSpace && size) {
            const totalBytes = Number(size);
            const freeBytes = Number(freeSpace);

            if (!isNaN(totalBytes) && !isNaN(freeBytes) && totalBytes > 0) {
              const usedBytes = totalBytes - freeBytes;
              return {
                total: totalBytes,
                free: freeBytes,
                used: usedBytes,
                usedPercentage: (usedBytes / totalBytes) * 100,
              };
            }
          }
        }
      }

      throw new Error('No valid disk information found');
    } else {
      const { stdout } = await execAsync(`df -k "${path}"`);
      const lines = stdout.trim().split('\n');

      if (lines.length < 2) {
        throw new Error('Unexpected df command output: insufficient lines');
      }

      const line = lines[1];
      if (!line) {
        throw new Error('No disk information line found in df output');
      }

      const stats = line.trim().split(/\s+/);

      // Verificar se temos todos os campos necessários
      // Formato típico do df: Filesystem 1K-blocks Used Available Use% Mounted
      if (stats.length < 5) {
        throw new Error(
          `Invalid df command output format: got ${stats.length} columns, expected at least 5`,
        );
      }

      const totalStr = stats[1]; // 1K-blocks total
      const usedStr = stats[2]; // Used
      const availStr = stats[3]; // Available
      const usedPercentageStr = stats[4]; // Use%

      if (!totalStr || !usedStr || !availStr || !usedPercentageStr) {
        throw new Error('Missing required values in df output');
      }

      const total = parseInt(totalStr, 10);
      const used = parseInt(usedStr, 10);
      const available = parseInt(availStr, 10);
      const usedPercentage = parseInt(usedPercentageStr, 10);

      if (isNaN(total) || isNaN(used) || isNaN(available) || isNaN(usedPercentage)) {
        throw new Error(
          `Invalid numeric values in df output: total=${totalStr}, used=${usedStr}, available=${availStr}, percentage=${usedPercentageStr}`,
        );
      }

      return {
        total: total * 1024, // Converter KB para bytes
        used: used * 1024, // Converter KB para bytes
        free: available * 1024, // Usar o "Available" como espaço livre
        usedPercentage,
      };
    }
  } catch (error) {
    console.error('Error getting disk info:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
    return {
      total: 0,
      free: 0,
      used: 0,
      usedPercentage: 0,
    };
  }
  // Ensure the function always returns a value
  return {
    total: 0,
    free: 0,
    used: 0,
    usedPercentage: 0,
  };
}
