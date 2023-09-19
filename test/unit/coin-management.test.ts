// Test keys for address 0x8c94aaf11b8e3341d3b7b527daaa7b13e2637419db6bfad53b93d8d267ea8cb8
const TEST_KEYS = [
  'AMat/wSZ1kXntDIoMrcoLFB5nt2rY2qYU0ImLW5AsbZ6', // base64
  '0xc6adff0499d645e7b4322832b7282c50799eddab636a985342262d6e40b1b67a', // hex
  'flash leave dilemma swing lab flavor shoot civil rookie list gather soul', // mnemonic
];

describe('Poll Lib initialization with create', () => {
  const chunksOfGas = 2;
  const txnsEstimate = 10;

  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
  });

  it('mock test', () => {

    const k = 0;
    expect(k).toBe(0);
    expect(chunksOfGas).toBe(2);
    expect(txnsEstimate).toBe(10);
  });
});
