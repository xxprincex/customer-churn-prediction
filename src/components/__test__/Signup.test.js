import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Signup from "../Signup";
import "@testing-library/jest-dom";

describe("Signup page test cases", () => {
  test("should load Signup component", () => {
    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>
    );
    const heading = screen.getByRole("heading");
    //Assertion
    expect(heading).toBeInTheDocument();
  });

  test("should load button", () => {
    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>
    );
    const button = screen.getByRole("button");
    //Assertion
    expect(button).toBeInTheDocument();
  });

  test("should load placeholder text", () => {
    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>
    );
    const inputName = screen.getByPlaceholderText("First name");
    //Assertion
    expect(inputName).toBeInTheDocument();
  });

  test("should loadd all the input boxes", () => {
    render(
      <MemoryRouter>
        <Signup />
      </MemoryRouter>
    );

    const inputBoxes = screen.getAllByRole("textbox");
    // console.log(inputBoxes.length);
    //Assertion
    expect(inputBoxes).toHaveLength(3);
  });
});
