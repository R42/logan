#include <stdio.h>
#include <stdint.h>
#include <signal.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/time.h>
#include <iostream>
#include <iomanip>

using namespace std;

// http://elinux.org/RPi_Low-level_peripherals
// http://zero.hotbox.lt/RPi/RPiLCD.c

int  mem_fd;
uint32_t *gpio_mem, *gpio_map;

// I/O access
volatile unsigned *gpio;

// pin mask
uint32_t mask;

#define BUFFER_SIZE 1024 * 1024

struct Sample {
  uint64_t tPrevious;
  uint64_t tNow;
  uint32_t sample;
};

Sample buffer[BUFFER_SIZE];
Sample *next, *guard;
unsigned int bufferPos = 0;

#define BCM2708_PERI_BASE 0x20000000
#define GPIO_BASE         (BCM2708_PERI_BASE + 0x200000) // GPIO controller

#define PAGE_SIZE (4*1024)
#define BLOCK_SIZE (4*1024)

// GPIO setup macros. Always use INP_GPIO(x) before using OUT_GPIO(x) or SET_GPIO_ALT(x,y)
#define INP_GPIO(g) *(gpio +((g) / 10)) &= ~(7 << (((g) % 10) * 3))
#define OUT_GPIO(g) *(gpio +((g) / 10)) |=  (1 << (((g) % 10) * 3))
#define SET_GPIO_ALT(g,a) *(gpio + (((g) / 10))) |=\
                          (((a) <= 3 ? (a) + 4 : (a) == 4 ? 3 : 2) << (((g) % 10) * 3))

#define GPIO_SET *(gpio+7)  // sets   bits which are 1 ignores bits which are 0
#define GPIO_CLR *(gpio+10) // clears bits which are 1 ignores bits which are 0

#define LCD_CS     17
#define LCD_SCK    22
#define LCD_MOSI   23
#define LCD_BUTTON 24
#define LCD_RESET  27

// Set up a memory regions to access GPIO
void SetupIO() {
  // open /dev/mem
  if ((mem_fd = open("/dev/mem", O_RDWR|O_SYNC) ) < 0) {
    cout << "can't open /dev/mem" << endl;
    exit(-1);
  }

  // mmap GPIO

  // Allocate MAP block
  int ret = posix_memalign(reinterpret_cast<void**>(&gpio_mem), PAGE_SIZE, PAGE_SIZE);
  if (ret != 0 || gpio_mem == NULL) {
    cerr << "posix_memalign failed: " << strerror(ret) << endl;
    exit(-1);
  }

  // Now map it
  gpio_map = (uint32_t *) mmap((caddr_t) gpio_mem,
                               BLOCK_SIZE,
                               PROT_READ  | PROT_WRITE,
                               MAP_SHARED | MAP_FIXED,
                               mem_fd,
                               GPIO_BASE);

  if ((long) gpio_map < 0) {
    cout << "mmap error " << (int) gpio_map << endl;
    exit(-1);
  }

  // Always use volatile pointer!
  gpio = (volatile uint32_t *) gpio_map;
}

void RawDumpSample(struct timespec &tPrevious, struct timespec &tNow, uint32_t previousSample, uint32_t sample) {
  const char tab = '\t';

  cout << dec << setfill('0') << setw(0) <<
          tPrevious.tv_sec << '.' << right << setw(9) << tPrevious.tv_nsec <<
          tab << setw(0) <<
          tNow.tv_sec << '.' << right << setw(9) << tNow.tv_nsec <<
          tab <<
          hex << setw(8) << sample << endl;
}

void WriteBit(uint32_t previous, uint32_t current, uint32_t bit) {
  const char *signal;
  previous &= bit;
  current &= bit;

  if (previous) {
    if (current) {
      signal = "⎹";
    } else {
      signal = "/";
    }
  } else {
    if (current) {
      signal = "\\";
    } else {
      signal = "⎸";
    }
  }
  printf(" \x1b[44m%s\x1b[m", signal);
}

void DumpSample(uint64_t tPrevious,
                uint64_t tNow,
                uint32_t previousSample,
                uint32_t sample) {
  printf("%9lld\t%9lld\t%08x\t%08x",
         tPrevious,
         tNow,
         previousSample,
         sample);

  WriteBit(previousSample, sample, 1 << LCD_BUTTON);
  WriteBit(previousSample, sample, 1 << LCD_MOSI);
  WriteBit(previousSample, sample, 1 << LCD_CS);
  WriteBit(previousSample, sample, 1 << LCD_SCK);
  WriteBit(previousSample, sample, 1 << LCD_RESET);

  printf("\n");
}

void DumpSamples() {
  Sample *current = buffer;
  uint32_t previousSample = current->sample;
  for (; current != next; current++) {
    DumpSample(current->tPrevious,
               current->tNow,
               previousSample,
               current->sample);
    previousSample = current->sample;
  }

  buffer[0] = next[-1];
  next = &buffer[1];
}

static void SigUsr1Handler(int signal) {
  DumpSamples();
}

int main(int argc, char ** argv) {
  SetupIO();

  next = buffer;
  guard = &buffer[BUFFER_SIZE];
  if (signal(SIGUSR1, SigUsr1Handler) == SIG_ERR) {
    cerr << "An error occurred while setting a signal handler." << endl;
    return EXIT_FAILURE;
  }

  // TODO get this mask from an argument
  // TODO map P1 pin number to GPIO pin
  // TODO support Rev. 1 P1 pin numbers
  mask = 1 << LCD_CS     | // 00020000 | GPIO 17 => P1-11 | <= C̅S̅
         1 << LCD_SCK    | // 00400000 | GPIO 22 => P1-15 | <= SCK
         1 << LCD_MOSI   | // 00800000 | GPIO 23 => P1-16 | <= MOSI
         1 << LCD_BUTTON | // 01000000 | GPIO 24 => P1-18 | <= (button)
         1 << LCD_RESET ;  // 08000000 | GPIO 27 => P1-13 | <= R̅E̅S̅E̅T̅

  uint32_t pinout = gpio[13] & mask, previous = pinout;
  uint64_t tick = 0;
  next->tNow = tick++;
  next->tPrevious = next->tNow;
  next->sample = pinout;
  next[1].tNow = next->tNow;
  next++;
  for (;;) {
    next->tPrevious = next->tNow;
    next->tNow = tick++;
    // if (tick % 1000 == 0) {
    //   printf(".");fflush(stdout);
    // }

    next->sample = gpio[13] & mask;
    if (next->sample != previous) {
      // printf("+");fflush(stdout);

      previous = next->sample;
      Sample *prev = next;
      if (++next == guard) next = buffer;
      next->tNow = prev->tNow;
    }
  }
}
