#include "postgres.h"

typedef struct SampleStruct
{
	int value;
} SampleStruct;

struct AnotherStruct {
	char val1;
	char val2;
};

extern PGDLLEXPORT void interface_function(void);

static void *function(int arg0, SampleStruct *arg1);

static void *function(int arg0, SampleStruct *arg1)
{
	int val1;
	struct AnotherStruct val2;
	SampleStruct val3;
	
	val3.value = 123;
	
	// Comment
	if (val3.value < 10) {
		printf("hello, world!");
	}

	return (void *) arg1;
}