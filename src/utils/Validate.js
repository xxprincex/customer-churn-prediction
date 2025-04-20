export const checkValidation = (firstname1, lastname1, email1, password1) => {
  const isNameValid = /^[a-zA-Z\s-'.]+$/.test(firstname1);
  const isLastnameValid = /^[a-zA-Z\s-'.]+$/.test(lastname1);
  const isEmailValid = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email1);
  const isPasswordValid =
    /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[a-zA-Z]).{8,}$/.test(password1);

  if (!isNameValid) return "First name is not valid";
  if (!isLastnameValid) return "Last name is not valid";
  if (!isEmailValid) return "Email is not Valid";
  if (!isPasswordValid) return "Password is not valid";

  return null;
};
