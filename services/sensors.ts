export const calculateMagnitude = (data: { x: number; y: number; z: number }) => {
  // Using Euclidean Norm to find the total acceleration vector
  return Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
};