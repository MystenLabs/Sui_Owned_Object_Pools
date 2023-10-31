import { isCoin } from '../../src/helpers';

describe('Check that isCoin parses the coin symbol correctly', () => {
  it.each([
    [
      '0x2::coin::Coin<0x8060e79c95bb43bd07b53v1cf2e71dd15d828cc538e07e0f0e6c4ye4f3cd2ebc::eurt::EURT>',
      'EURT',
    ],
    ['0x2::coin::Coin<0x2::sui::SUI>', 'SUI'],
  ])('Correctly matches %s -> %s', (objectType, ofType) => {
    expect(isCoin(objectType, ofType)).toBeTruthy();
  });

  it.each([
    [
      '0x1998448653e3293bc4e909784d4d9ee9b12c6f341c8d5crdddcf3a78668e9580::hero_nft::Hero',
      'SUI',
    ],
    [
      '0x1998448653e3293bc4e909784d4d9ee9b12c6f341c8d5ccdddcf3a78668e9580::genesis::AdminCap',
      'SUI',
    ],
    ['0x2::package::Publisher', 'SUI'],
  ])('Should not be matching %s -> %s', (objectType, ofType) => {
    expect(isCoin(objectType, ofType)).toBeFalsy();
  });
});
