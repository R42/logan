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
// pointer to previous sample
uint32_t *pprevious;

#define BUFFER_SIZE 1024 * 1024

// tick counter
volatile uint64_t tick = 0;

struct Sample {
  uint64_t time;
  uint32_t sample;
};

Sample buffer[BUFFER_SIZE];
Sample *next, *guard;
unsigned int bufferPos = 0;

#define BCM2708_PERI_BASE 0x20000000
#define GPIO_BASE         (BCM2708_PERI_BASE + 0x200000) // GPIO controller

#define PAGE_SIZE (4*1024)
#define BLOCK_SIZE (4*1024)

// Wired back pins
// #define LCD_CS     17
// #define LCD_SCK    22
// #define LCD_MOSI   23
// #define LCD_RESET  27

// Actual pins
#define LCD_CS     8
#define LCD_SCK    11
#define LCD_MOSI   10
#define LCD_RESET  25

// Extra button, for testing only, not part of spi nor the lcd control lines
#define LCD_BUTTON 24

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
  gpio = (volatile uint32_t *) &gpio_map[13];
}

void DumpSamples() {
  uint64_t baseTime = buffer[0].time;

  fprintf(stderr, "# Samples\t%d\n", next - buffer);

  Sample *current;
  for (current = buffer; current != next; current++) {
    fprintf(stderr, "%9lld\t%08x\n", current->time - baseTime, current->sample);
  }

  fprintf(stderr, "# EOB\n");

  buffer[0] = next[-1];
  next = &buffer[1];
}

static void SigUsr1Handler(int signal) {
  DumpSamples();
}

static void SigUsr2Handler(int signal) {
  tick = 0;
  next = buffer;
  *pprevious = ~0;
}

int main(int argc, char ** argv) {
  SetupIO();

  guard = &buffer[BUFFER_SIZE];

  if (signal(SIGUSR1, SigUsr1Handler) == SIG_ERR) {
    cerr << "An error occurred while setting the USR1 signal handler." << endl;
    return EXIT_FAILURE;
  }

  if (signal(SIGUSR2, SigUsr2Handler) == SIG_ERR) {
    cerr << "An error occurred while setting the USR2 signal handler." << endl;
    return EXIT_FAILURE;
  }

  // TODO map P1 pin number to GPIO pin
  // TODO support Rev. 1 P1 pin numbers
  mask = 0;
  for (int i = 1; i < argc; i++) {
    mask |= 1 << atoi(argv[i]);
  }

  fprintf(stderr, "# Ready to go, (mask=0x%08x).\n", mask);

  uint32_t pinout   = *gpio & mask;
  uint32_t previous = pinout;
  pprevious = &previous;

  uint32_t sample;

  next = buffer;
  for (;;) {
    sample = *gpio & mask;

    if (sample != previous) {
      next->time = tick;
      next->sample = previous = sample;
      next++;

      if (next == guard) { next = buffer; }
    }

    tick++;
  }
}
