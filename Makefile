CPPFLAGS = -g -Wall

.PHONY: clean

all: logan

clean:
	rm logan *.o

logan: logan.cc

it: all
run: all
	sudo ./logan

