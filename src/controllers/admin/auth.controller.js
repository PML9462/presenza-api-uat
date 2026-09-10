const httpStatus = require('http-status');
const catchAsync = require('../../utils/catchAsync');
const { authService } = require('../../services/index');

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;


  const result = await authService.login({ email, password });

  return res.status(httpStatus.status.OK).json({
    message: 'Login successful',
    data: {
      tokens: result.tokens,
      user: result.employee,

    },
  });
});

module.exports = {
    login,
};